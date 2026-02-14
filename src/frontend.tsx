import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import "./styles.css";

interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  photoUrl?: string;
  placeUrl?: string;
  searchTerm: string;
}

interface Config {
  apiKey: string;
}

function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  // Markers keyed by place ID for direct lookup
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  // List item DOM refs for scroll-to behavior

  const [apiKey, setApiKey] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Draw a polygon on the map to define your search area");

  // Fetch API key from server
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((config: Config) => setApiKey(config.apiKey))
      .catch((err) => console.error("Failed to fetch config:", err));
  }, []);

  // Load Google Maps script once we have the key
  useEffect(() => {
    if (!apiKey || apiKey === "YOUR_API_KEY") return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [apiKey]);

  // Initialize map + drawing manager + location autocomplete
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !locationInputRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 40.7128, lng: -74.006 },
      zoom: 13,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;
    placesServiceRef.current = new google.maps.places.PlacesService(map);

    // Location search autocomplete (for panning the map)
    const autocomplete = new google.maps.places.Autocomplete(locationInputRef.current!, {
      fields: ["geometry", "name"],
    });
    autocomplete.bindTo("bounds", map);
    autocompleteRef.current = autocomplete;

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;

      if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else {
        map.setCenter(place.geometry.location);
        map.setZoom(15);
      }
    });

    // Drawing manager
    const drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        fillColor: "#4285f4",
        fillOpacity: 0.15,
        strokeColor: "#4285f4",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
    });

    drawingManager.setMap(map);
    drawingManagerRef.current = drawingManager;

    google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon: google.maps.Polygon) => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
      polygonRef.current = polygon;
      setHasPolygon(true);
      setIsDrawing(false);
      drawingManager.setDrawingMode(null);
      setStatusMessage("Polygon drawn. Enter a search query and click Search.");
    });
  }, [isLoaded]);

  const toggleDrawing = useCallback(() => {
    if (!drawingManagerRef.current) return;
    if (isDrawing) {
      drawingManagerRef.current.setDrawingMode(null);
      setIsDrawing(false);
    } else {
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      setIsDrawing(true);
      setStatusMessage("Click the map to draw polygon vertices. Click the first point to close.");
    }
  }, [isDrawing]);

  const clearPolygon = useCallback(() => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    setHasPolygon(false);
    setStatusMessage("Draw a polygon on the map to define your search area");
  }, []);

  const removePlace = useCallback((id: string) => {
    const marker = markersRef.current.get(id);
    if (marker) {
      marker.setMap(null);
      markersRef.current.delete(id);
    }
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearResults = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();
    setPlaces([]);
    setStatusMessage(hasPolygon ? "Results cleared. Enter a new search query." : "Draw a polygon on the map to define your search area");
  }, [hasPolygon]);

  const getPhotoUrl = (photo: google.maps.places.PlacePhoto | undefined): string | undefined => {
    if (!photo) return undefined;
    return photo.getUrl({ maxWidth: 400, maxHeight: 400 });
  };

  const searchPlaces = useCallback(async () => {
    if (!polygonRef.current || !placesServiceRef.current || !searchQuery.trim()) {
      setStatusMessage("Please draw a polygon and enter a search query");
      return;
    }

    setIsSearching(true);
    setStatusMessage(`Searching for "${searchQuery}"...`);

    const polygon = polygonRef.current;
    const path = polygon.getPath();
    const bounds = new google.maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));

    const isInsidePolygon = (latLng: google.maps.LatLng): boolean =>
      google.maps.geometry.poly.containsLocation(latLng, polygon);

    // Capture current places IDs to avoid duplicates
    const existingIds = new Set(places.map((p) => p.id));
    const newPlaces: PlaceResult[] = [];

    const searchRequest: google.maps.places.TextSearchRequest = {
      query: searchQuery,
      bounds,
    };

    const processPage = (): Promise<void> => {
      return new Promise((resolve) => {
        placesServiceRef.current!.textSearch(searchRequest, (results, status, pagination) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
            resolve();
            return;
          }

          const inPolygon = results.filter(
            (place) => place.geometry?.location && isInsidePolygon(place.geometry.location)
          );

          const detailPromises = inPolygon.map((place) => {
            // Skip duplicates
            if (!place.place_id || existingIds.has(place.place_id)) {
              return Promise.resolve(null);
            }
            existingIds.add(place.place_id);

            return new Promise<PlaceResult | null>((resolveDetail) => {
              placesServiceRef.current!.getDetails(
                {
                  placeId: place.place_id!,
                  fields: [
                    "name",
                    "formatted_address",
                    "formatted_phone_number",
                    "website",
                    "rating",
                    "user_ratings_total",
                    "types",
                    "photos",
                    "geometry",
                    "url",
                  ],
                },
                (details, detailStatus) => {
                  if (detailStatus !== google.maps.places.PlacesServiceStatus.OK || !details) {
                    resolveDetail(null);
                    return;
                  }
                  resolveDetail({
                    id: place.place_id!,
                    name: details.name || place.name || "Unknown",
                    address: details.formatted_address || place.formatted_address || "",
                    lat: details.geometry?.location?.lat() || 0,
                    lng: details.geometry?.location?.lng() || 0,
                    phone: details.formatted_phone_number,
                    website: details.website,
                    rating: details.rating,
                    userRatingsTotal: details.user_ratings_total,
                    types: details.types,
                    photoUrl: getPhotoUrl(details.photos?.[0]),
                    placeUrl: details.url,
                    searchTerm: searchQuery,
                  });
                }
              );
            });
          });

          Promise.all(detailPromises).then((detailedPlaces) => {
            const valid = detailedPlaces.filter((p): p is PlaceResult => p !== null);
            newPlaces.push(...valid);

            // Add markers for new places
            valid.forEach((place) => {
              if (markersRef.current.has(place.id)) return;
              const marker = new google.maps.Marker({
                position: { lat: place.lat, lng: place.lng },
                map: mapInstanceRef.current!,
                title: place.name,
              });

              markersRef.current.set(place.id, marker);
            });

            // Append to existing places, guard against any concurrent duplicates
            setPlaces((prev) => {
              const seenIds = new Set(prev.map((p) => p.id));
              const deduped = valid.filter((p) => !seenIds.has(p.id));
              const updated = [...prev, ...deduped];
              setStatusMessage(`Found ${updated.length} total places.`);
              return updated;
            });

            if (pagination?.hasNextPage) {
              setTimeout(() => pagination.nextPage(), 2000);
            } else {
              resolve();
            }
          });
        });
      });
    };

    try {
      await processPage();
      setStatusMessage((msg) => msg); // keep last "Found X total places"
    } catch (error) {
      console.error("Search error:", error);
      setStatusMessage("Error during search. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, places]);

  const downloadCSV = useCallback(() => {
    if (places.length === 0) return;

    const headers = [
      "Name",
      "Search Term",
      "Address",
      "Phone",
      "Website",
      "Rating",
      "Total Reviews",
      "Types",
      "Latitude",
      "Longitude",
      "Photo URL",
      "Google Maps URL",
    ];

    const escapeCSV = (value: string | undefined | null): string => {
      if (value == null) return "";
      const str = String(value);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const rows = places.map((p) => [
      escapeCSV(p.name),
      escapeCSV(p.searchTerm),
      escapeCSV(p.address),
      escapeCSV(p.phone),
      escapeCSV(p.website),
      escapeCSV(p.rating?.toString()),
      escapeCSV(p.userRatingsTotal?.toString()),
      escapeCSV(p.types?.join("; ")),
      escapeCSV(p.lat.toString()),
      escapeCSV(p.lng.toString()),
      escapeCSV(p.photoUrl),
      escapeCSV(p.placeUrl),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `places_export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [places]);

  const handleCardMouseEnter = useCallback((id: string) => {
    const marker = markersRef.current.get(id);
    if (marker) marker.setAnimation(google.maps.Animation.BOUNCE);
  }, []);

  const handleCardMouseLeave = useCallback((id: string) => {
    const marker = markersRef.current.get(id);
    if (marker) marker.setAnimation(null);
  }, []);

  if (!apiKey || apiKey === "YOUR_API_KEY") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>Google Maps Places Finder</h1>
        <p style={{ marginTop: 20, color: "#666" }}>
          Please set your Google Maps API key in the environment variable{" "}
          <code>GOOGLE_MAPS_API_KEY</code>
        </p>
        <p style={{ marginTop: 10, color: "#888", fontSize: 14 }}>
          Run: <code>GOOGLE_MAPS_API_KEY=your_key bun --hot src/index.ts</code>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Sidebar */}
      <div className="w-[400px] bg-white shadow-[2px_0_10px_rgba(0,0,0,0.1)] flex flex-col z-10">

        {/* Header: location + search */}
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-2xl font-semibold text-gray-800 mb-3">Places Finder</h1>

          {/* Location search — pans the map */}
          <div className="mb-2">
            <Input
              ref={locationInputRef}
              type="text"
              placeholder="Go to location..."
              className="bg-blue-50 border-blue-200 focus-visible:bg-white"
            />
          </div>

          {/* Polygon search query */}
          <div className="flex flex-col gap-2.5">
            <Input
              type="text"
              placeholder="Search within polygon (e.g. cafes)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPlaces()}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={searchPlaces}
                disabled={!hasPolygon || !searchQuery.trim() || isSearching}
              >
                {isSearching ? "Searching..." : "Search"}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={clearResults}
                disabled={places.length === 0}
              >
                Clear All
              </Button>
            </div>
          </div>
        </div>

        {/* Drawing controls */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2.5">
          <span className="text-sm text-gray-500">Polygon:</span>
          <Button
            variant={isDrawing ? "default" : "outline"}
            size="sm"
            onClick={toggleDrawing}
          >
            {isDrawing ? "Cancel" : "Draw"}
          </Button>
          {hasPolygon && (
            <Button variant="destructive" size="sm" onClick={clearPolygon}>
              Remove
            </Button>
          )}
        </div>

        {/* Status bar */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
          {statusMessage}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {places.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-800">Results</h2>
                <span className="text-xs text-gray-500">{places.length} places</span>
              </div>
              <div className="mb-4">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white w-full"
                  onClick={downloadCSV}
                >
                  Download CSV
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {places.map((place) => (
                  <Card
                    key={place.id}
                    className="p-3 gap-0 rounded-lg cursor-default"
                    onMouseEnter={() => handleCardMouseEnter(place.id)}
                    onMouseLeave={() => handleCardMouseLeave(place.id)}
                  >
                    <div className="flex gap-3">
                      {place.photoUrl ? (
                        <img
                          src={place.photoUrl}
                          alt={place.name}
                          className="w-[60px] h-[60px] rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-[60px] h-[60px] rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">
                          No image
                        </div>
                      )}
                      <div className="flex-1 min-w-0 relative">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-0 right-0 text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none"
                          onClick={() => removePlace(place.id)}
                          title="Remove"
                        >
                          ×
                        </Button>
                        <div className="font-semibold text-sm text-gray-800 truncate pr-6 mb-1" title={place.name}>
                          {place.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate mb-1.5" title={place.address}>
                          {place.address}
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span className="bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded">
                            {place.searchTerm}
                          </span>
                          {place.rating && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              ★ {place.rating} ({place.userRatingsTotal})
                            </span>
                          )}
                          {place.phone && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              {place.phone}
                            </span>
                          )}
                          {place.website && (
                            <a
                              href={place.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-green-100 text-green-700 px-2 py-0.5 rounded hover:bg-green-200 no-underline"
                            >
                              Website
                            </a>
                          )}
                          {place.placeUrl && (
                            <a
                              href={place.placeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-green-100 text-green-700 px-2 py-0.5 rounded hover:bg-green-200 no-underline"
                            >
                              Maps
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10 px-5 text-gray-500">
              <p className="mb-2">No results yet</p>
              <div className="text-xs text-gray-400 leading-relaxed">
                <p>1. Use "Go to location" to navigate the map</p>
                <p>2. Click "Draw" to draw a polygon search area</p>
                <p>3. Type a query and click "Search"</p>
                <p>4. Run multiple searches — results accumulate</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {!isLoaded && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[100]">
            <div className="loading-spinner" />
          </div>
        )}
        <div id="map" ref={mapRef} />
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
