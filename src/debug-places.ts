// DEBUG DATA — for local development only. Import in frontend.tsx to populate the list without making API calls.
// Usage in frontend.tsx:
//   import { DEBUG_PLACES } from "./debug-places";
//   const [places, setPlaces] = useState<PlaceResult[]>(DEBUG_PLACES);

import type { PlaceResult } from "./frontend";

export const DEBUG_PLACES: PlaceResult[] = [
  { id: "1", name: "Joe's Pizza", address: "7 Carmine St, New York, NY 10014", lat: 40.7306, lng: -74.0021, phone: "+1 212-366-1182", website: "https://joespizzanyc.com", rating: 4.5, userRatingsTotal: 3200, searchTerm: "pizza", placeUrl: "https://maps.google.com/?cid=1" },
  { id: "2", name: "Shake Shack", address: "691 8th Ave, New York, NY 10036", lat: 40.7569, lng: -73.9939, rating: 4.3, userRatingsTotal: 5100, searchTerm: "burgers", placeUrl: "https://maps.google.com/?cid=2" },
  { id: "3", name: "Levain Bakery", address: "167 W 74th St, New York, NY 10023", lat: 40.7791, lng: -73.9822, phone: "+1 212-874-6080", rating: 4.7, userRatingsTotal: 8900, searchTerm: "bakery", placeUrl: "https://maps.google.com/?cid=3" },
  { id: "4", name: "Katz's Delicatessen", address: "205 E Houston St, New York, NY 10002", lat: 40.7223, lng: -73.9873, phone: "+1 212-254-2246", website: "https://katzsdelicatessen.com", rating: 4.4, userRatingsTotal: 12000, searchTerm: "deli", placeUrl: "https://maps.google.com/?cid=4" },
  { id: "5", name: "Veselka", address: "144 2nd Ave, New York, NY 10003", lat: 40.7281, lng: -73.9879, rating: 4.2, userRatingsTotal: 4300, searchTerm: "diner", placeUrl: "https://maps.google.com/?cid=5" },
  { id: "6", name: "The Halal Guys", address: "W 53rd St & 6th Ave, New York, NY 10019", lat: 40.7614, lng: -73.9793, rating: 4.6, userRatingsTotal: 22000, searchTerm: "halal", placeUrl: "https://maps.google.com/?cid=6" },
  { id: "7", name: "Mamoun's Falafel", address: "119 MacDougal St, New York, NY 10012", lat: 40.7303, lng: -74.0007, phone: "+1 212-674-8685", rating: 4.4, userRatingsTotal: 6700, searchTerm: "falafel", placeUrl: "https://maps.google.com/?cid=7" },
  { id: "8", name: "Xi'an Famous Foods", address: "81 St Marks Pl, New York, NY 10003", lat: 40.7275, lng: -73.9845, rating: 4.5, userRatingsTotal: 3800, searchTerm: "noodles", placeUrl: "https://maps.google.com/?cid=8" },
  { id: "9", name: "Russ & Daughters", address: "179 E Houston St, New York, NY 10002", lat: 40.7224, lng: -73.9868, website: "https://russanddaughters.com", rating: 4.7, userRatingsTotal: 5500, searchTerm: "bagels", placeUrl: "https://maps.google.com/?cid=9" },
  { id: "10", name: "Prince Street Pizza", address: "27 Prince St, New York, NY 10012", lat: 40.7233, lng: -73.9972, rating: 4.6, userRatingsTotal: 7200, searchTerm: "pizza", placeUrl: "https://maps.google.com/?cid=10" },
];
