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
}

interface Config {
  apiKey: string;
}

function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

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
      .then((config: Config) => {
        setApiKey(config.apiKey);
      })
      .catch((err) => console.error("Failed to fetch config:", err));
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || apiKey === "YOUR_API_KEY") return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [apiKey]);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 40.7128, lng: -74.006 },
      zoom: 13,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;
    placesServiceRef.current = new google.maps.places.PlacesService(map);

    // Initialize drawing manager
    const drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        fillColor: "#4285f4",
        fillOpacity: 0.2,
        strokeColor: "#4285f4",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
    });

    drawingManager.setMap(map);
    drawingManagerRef.current = drawingManager;

    // Handle polygon complete
    google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon: google.maps.Polygon) => {
      // Remove previous polygon if exists
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
      setStatusMessage("Click on the map to draw polygon vertices. Click the first point to close.");
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

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
  }, []);

  const clearResults = useCallback(() => {
    setPlaces([]);
    clearMarkers();
    setStatusMessage(hasPolygon ? "Results cleared. Enter a new search query." : "Draw a polygon on the map to define your search area");
  }, [hasPolygon, clearMarkers]);

  const getPhotoUrl = (photo: google.maps.places.PlacePhoto | undefined, apiKey: string): string | undefined => {
    if (!photo) return undefined;
    return photo.getUrl({ maxWidth: 400, maxHeight: 400 });
  };

  const searchPlaces = useCallback(async () => {
    if (!polygonRef.current || !placesServiceRef.current || !searchQuery.trim()) {
      setStatusMessage("Please draw a polygon and enter a search query");
      return;
    }

    setIsSearching(true);
    setStatusMessage("Searching for places...");
    clearMarkers();

    const polygon = polygonRef.current;
    const path = polygon.getPath();
    const bounds = new google.maps.LatLngBounds();

    // Get polygon bounds
    path.forEach((point) => bounds.extend(point));

    const center = bounds.getCenter();
    const allPlaces: PlaceResult[] = [];

    // Function to check if point is inside polygon
    const isInsidePolygon = (latLng: google.maps.LatLng): boolean => {
      return google.maps.geometry.poly.containsLocation(latLng, polygon);
    };

    // Search using text search
    const searchRequest: google.maps.places.TextSearchRequest = {
      query: searchQuery,
      bounds: bounds,
    };

    const searchNearby = (pageToken?: string): Promise<void> => {
      return new Promise((resolve) => {
        const request: google.maps.places.TextSearchRequest = pageToken
          ? { ...searchRequest, pageToken }
          : searchRequest;

        placesServiceRef.current!.textSearch(request, (results, status, pagination) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            // Filter places within polygon and get details
            const placesInPolygon = results.filter((place) => {
              if (!place.geometry?.location) return false;
              return isInsidePolygon(place.geometry.location);
            });

            // Get detailed info for each place
            const detailPromises = placesInPolygon.map((place) => {
              return new Promise<PlaceResult | null>((resolveDetail) => {
                if (!place.place_id) {
                  resolveDetail(null);
                  return;
                }

                placesServiceRef.current!.getDetails(
                  {
                    placeId: place.place_id,
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
                    if (detailStatus === google.maps.places.PlacesServiceStatus.OK && details) {
                      const photoUrl = details.photos?.[0]
                        ? getPhotoUrl(details.photos[0], apiKey)
                        : undefined;

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
                        photoUrl,
                        placeUrl: details.url,
                      });
                    } else {
                      resolveDetail(null);
                    }
                  }
                );
              });
            });

            Promise.all(detailPromises).then((detailedPlaces) => {
              const validPlaces = detailedPlaces.filter((p): p is PlaceResult => p !== null);
              allPlaces.push(...validPlaces);
              setPlaces([...allPlaces]);
              setStatusMessage(`Found ${allPlaces.length} places so far...`);

              // Add markers
              validPlaces.forEach((place) => {
                const marker = new google.maps.Marker({
                  position: { lat: place.lat, lng: place.lng },
                  map: mapInstanceRef.current!,
                  title: place.name,
                });
                markersRef.current.push(marker);
              });

              // Get next page if available
              if (pagination?.hasNextPage) {
                setTimeout(() => {
                  pagination.nextPage();
                }, 2000);
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
      });
    };

    try {
      await searchNearby();
      setStatusMessage(`Search complete. Found ${allPlaces.length} places within the polygon.`);
    } catch (error) {
      console.error("Search error:", error);
      setStatusMessage("Error during search. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, apiKey, clearMarkers]);

  const downloadCSV = useCallback(() => {
    if (places.length === 0) return;

    const headers = [
      "Name",
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
      if (value === undefined || value === null) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = places.map((place) => [
      escapeCSV(place.name),
      escapeCSV(place.address),
      escapeCSV(place.phone),
      escapeCSV(place.website),
      escapeCSV(place.rating?.toString()),
      escapeCSV(place.userRatingsTotal?.toString()),
      escapeCSV(place.types?.join("; ")),
      escapeCSV(place.lat.toString()),
      escapeCSV(place.lng.toString()),
      escapeCSV(place.photoUrl),
      escapeCSV(place.placeUrl),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `places_${searchQuery.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [places, searchQuery]);

  if (!apiKey || apiKey === "YOUR_API_KEY") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>Google Maps Places Finder</h1>
        <p style={{ marginTop: 20, color: "#666" }}>
          Please set your Google Maps API key in the environment variable{" "}
          <code>GOOGLE_MAPS_API_KEY</code>
        </p>
        <p style={{ marginTop: 10, color: "#888", fontSize: 14 }}>
          Run the server with: <code>GOOGLE_MAPS_API_KEY=your_key bun --hot index.ts</code>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Places Finder</h1>
          <div className="search-controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search query (e.g., restaurants, cafes)"
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
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="drawing-controls">
          <label>Polygon:</label>
          <button
            className={`btn btn-draw ${isDrawing ? "active" : ""}`}
            onClick={toggleDrawing}
          >
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
                  <div key={place.id} className="place-card">
                    <div className="place-card-header">
                      {place.photoUrl ? (
                        <img src={place.photoUrl} alt={place.name} className="place-image" />
                      ) : (
                        <div className="place-image-placeholder">No image</div>
                      )}
                      <div className="place-info">
                        <div className="place-name" title={place.name}>
                          {place.name}
                        </div>
                        <div className="place-address" title={place.address}>
                          {place.address}
                        </div>
                        <div className="place-meta">
                          {place.rating && (
                            <span>
                              {place.rating} ({place.userRatingsTotal})
                            </span>
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
                <p>1. Click "Draw" to draw a polygon on the map</p>
                <p>2. Enter a search query (e.g., "restaurants")</p>
                <p>3. Click "Search" to find places</p>
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
