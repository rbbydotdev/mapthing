import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
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
  const listItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [apiKey, setApiKey] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Draw a polygon on the map to define your search area");
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

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
    listItemRefs.current.delete(id);
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setActiveMarkerId((prev) => (prev === id ? null : prev));
  }, []);

  const clearResults = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();
    listItemRefs.current.clear();
    setPlaces([]);
    setActiveMarkerId(null);
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

              marker.addListener("click", () => {
                setActiveMarkerId(place.id);
                // Scroll list item into view
                const el = listItemRefs.current.get(place.id);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              });

              markersRef.current.set(place.id, marker);
            });

            // Append to existing places
            setPlaces((prev) => {
              const updated = [...prev, ...valid];
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
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Places Finder</h1>

          {/* Location search — pans the map */}
          <div className="location-search-wrap">
            <input
              ref={locationInputRef}
              type="text"
              className="search-input location-input"
              placeholder="Go to location..."
            />
          </div>

          {/* Polygon search query */}
          <div className="search-controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search within polygon (e.g. cafes)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPlaces()}
            />
            <div className="button-row">
              <button
                className="btn btn-primary"
                onClick={searchPlaces}
                disabled={!hasPolygon || !searchQuery.trim() || isSearching}
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
              <button className="btn btn-secondary" onClick={clearResults} disabled={places.length === 0}>
                Clear All
              </button>
            </div>
          </div>
        </div>

        <div className="drawing-controls">
          <label>Polygon:</label>
          <button className={`btn btn-draw ${isDrawing ? "active" : ""}`} onClick={toggleDrawing}>
            {isDrawing ? "Cancel" : "Draw"}
          </button>
          {hasPolygon && (
            <button className="btn btn-danger btn-draw" onClick={clearPolygon}>
              Remove
            </button>
          )}
        </div>

        <div className="status-bar">{statusMessage}</div>

        <div className="results-container">
          {places.length > 0 ? (
            <>
              <div className="results-header">
                <h2>Results</h2>
                <span className="results-count">{places.length} places</span>
              </div>
              <div className="button-row" style={{ marginBottom: 15 }}>
                <button className="btn btn-success" onClick={downloadCSV}>
                  Download CSV
                </button>
              </div>
              <div className="results-list">
                {places.map((place) => (
                  <div
                    key={place.id}
                    ref={(el) => {
                      if (el) listItemRefs.current.set(place.id, el);
                      else listItemRefs.current.delete(place.id);
                    }}
                    className={`place-card ${activeMarkerId === place.id ? "place-card--active" : ""}`}
                    onMouseEnter={() => handleCardMouseEnter(place.id)}
                    onMouseLeave={() => handleCardMouseLeave(place.id)}
                  >
                    <div className="place-card-header">
                      {place.photoUrl ? (
                        <img src={place.photoUrl} alt={place.name} className="place-image" />
                      ) : (
                        <div className="place-image-placeholder">No image</div>
                      )}
                      <div className="place-info">
                        <div className="place-name-row">
                          <div className="place-name" title={place.name}>
                            {place.name}
                          </div>
                          <button
                            className="btn-remove"
                            onClick={() => removePlace(place.id)}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                        <div className="place-address" title={place.address}>
                          {place.address}
                        </div>
                        <div className="place-meta">
                          <span className="tag-search">{place.searchTerm}</span>
                          {place.rating && (
                            <span>★ {place.rating} ({place.userRatingsTotal})</span>
                          )}
                          {place.phone && <span>{place.phone}</span>}
                          {place.website && (
                            <a href={place.website} target="_blank" rel="noopener noreferrer">
                              Website
                            </a>
                          )}
                          {place.placeUrl && (
                            <a href={place.placeUrl} target="_blank" rel="noopener noreferrer">
                              Maps
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="no-results">
              <p>No results yet</p>
              <div className="instructions">
                <p>1. Use "Go to location" to navigate the map</p>
                <p>2. Click "Draw" to draw a polygon search area</p>
                <p>3. Type a query and click "Search"</p>
                <p>4. Run multiple searches — results accumulate</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="map-container">
        {!isLoaded && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}
        <div id="map" ref={mapRef}></div>
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
