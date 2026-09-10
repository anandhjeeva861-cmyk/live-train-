export const stations = [
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { code: 'KPD', name: 'Katpadi Junction', city: 'Vellore', lat: 12.9692, lng: 79.1453 },
  { code: 'JTJ', name: 'Jolarpettai Junction', city: 'Jolarpettai', lat: 12.5700, lng: 78.5750 },
  { code: 'SA', name: 'Salem Junction', city: 'Salem', lat: 11.6690, lng: 78.1300 },
  { code: 'SBC', name: 'KSR Bengaluru City', city: 'Bengaluru', lat: 12.9784, lng: 77.5725 },
  { code: 'MYS', name: 'Mysuru Junction', city: 'Mysuru', lat: 12.3163, lng: 76.6451 },
  { code: 'CBE', name: 'Coimbatore Junction', city: 'Coimbatore', lat: 10.9964, lng: 76.9673 },
  { code: 'MTP', name: 'Mettupalayam', city: 'Mettupalayam', lat: 11.3000, lng: 76.9400 },
  { code: 'ONR', name: 'Coonoor', city: 'Coonoor', lat: 11.3530, lng: 76.7959 },
  { code: 'UAM', name: 'Udhagamandalam', city: 'Ooty', lat: 11.4064, lng: 76.6932 },
  { code: 'TPJ', name: 'Tiruchchirappalli Junction', city: 'Trichy', lat: 10.7905, lng: 78.7047 },
  { code: 'MDU', name: 'Madurai Junction', city: 'Madurai', lat: 9.9195, lng: 78.1193 }
];

const route = (...codes) => codes.map(code => {
  const s = stations.find(x => x.code === code);
  if (!s) throw new Error(`Unknown station code: ${code}`);
  return { name: s.name, code: s.code, city: s.city, lat: s.lat, lng: s.lng };
});

export const trains = [
  {
    id: 'brindavan', number: '12639', name: 'Brindavan Express', type: 'normal',
    from: stations[0], to: stations[4], departure: '07:40', arrival: '13:40', duration: '6h 00m', rating: 4.6,
    fare: { '2S': 190, 'CC': 720 }, seats: { '2S': 164, 'CC': 38 },
    route: route('MAS', 'KPD', 'JTJ', 'SBC')
  },
  {
    id: 'shatabdi', number: '12027', name: 'Chennai Bengaluru Shatabdi', type: 'normal',
    from: stations[0], to: stations[4], departure: '17:30', arrival: '22:25', duration: '4h 55m', rating: 4.8,
    fare: { 'CC': 980, 'EC': 1840 }, seats: { 'CC': 52, 'EC': 15 },
    route: route('MAS', 'KPD', 'JTJ', 'SBC')
  },
  {
    id: 'mysuru-express', number: '16021', name: 'Kaveri Express', type: 'normal',
    from: stations[0], to: stations[5], departure: '21:15', arrival: '06:40', duration: '9h 25m', rating: 4.4,
    fare: { 'SL': 420, '3A': 1110, '2A': 1580 }, seats: { 'SL': 94, '3A': 34, '2A': 13 },
    route: route('MAS', 'KPD', 'JTJ', 'SBC', 'MYS')
  },
  {
    id: 'south-heritage', number: 'TR101', name: 'South Heritage Tourism Special', type: 'tourism',
    from: stations[0], to: stations[4], departure: '09:00', arrival: '16:00', duration: '7h 00m', rating: 4.9,
    fare: { 'EV': 1499, 'PC': 2399 }, seats: { 'EV': 28, 'PC': 12 },
    route: route('MAS', 'KPD', 'JTJ', 'SBC')
  },
  {
    id: 'cheran', number: '12673', name: 'Cheran Superfast Express', type: 'normal',
    from: stations[0], to: stations[6], departure: '22:00', arrival: '06:05', duration: '8h 05m', rating: 4.6,
    fare: { 'SL': 390, '3A': 1020, '2A': 1450 }, seats: { 'SL': 112, '3A': 46, '2A': 17 },
    route: route('MAS', 'KPD', 'SA', 'CBE')
  },
  {
    id: 'kovai', number: '12675', name: 'Kovai Superfast Express', type: 'normal',
    from: stations[0], to: stations[6], departure: '06:10', arrival: '13:55', duration: '7h 45m', rating: 4.7,
    fare: { 'CC': 705, '2S': 205 }, seats: { 'CC': 28, '2S': 144 },
    route: route('MAS', 'KPD', 'SA', 'CBE')
  },
  {
    id: 'mysuru-vista', number: 'TR021', name: 'Mysuru Heritage Vista', type: 'tourism',
    from: stations[4], to: stations[5], departure: '07:30', arrival: '11:10', duration: '3h 40m', rating: 4.9,
    fare: { 'EV': 1299, 'PC': 1999 }, seats: { 'EV': 36, 'PC': 14 },
    route: route('SBC', 'MYS')
  },
  {
    id: 'nilgiri-tour', number: 'TR007', name: 'Nilgiri Scenic Railway Tour', type: 'tourism',
    from: stations[6], to: stations[9], departure: '06:45', arrival: '12:35', duration: '5h 50m', rating: 4.9,
    fare: { 'EV': 1599, 'PC': 2399 }, seats: { 'EV': 22, 'PC': 9 },
    route: route('CBE', 'MTP', 'ONR', 'UAM')
  },
  {
    id: 'pandian', number: '12637', name: 'Pandian Superfast Express', type: 'normal',
    from: stations[0], to: stations[11], departure: '21:40', arrival: '06:40', duration: '9h 00m', rating: 4.5,
    fare: { 'SL': 420, '3A': 1110, '2A': 1580 }, seats: { 'SL': 87, '3A': 31, '2A': 12 },
    route: route('MAS', 'TPJ', 'MDU')
  }
];

export const touristSpots = [
  { id: 1, city: 'Chennai', name: 'Marina Beach', distanceKm: 4.2, category: 'Beach', rating: 4.6, lat: 13.0500, lng: 80.2824, image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=1000&q=80' },
  { id: 2, city: 'Chennai', name: 'Kapaleeshwarar Temple', distanceKm: 6.8, category: 'Heritage', rating: 4.8, lat: 13.0337, lng: 80.2699, image: 'https://images.unsplash.com/photo-1600100397608-f010f19b6f8f?auto=format&fit=crop&w=1000&q=80' },
  { id: 3, city: 'Bengaluru', name: 'Lalbagh Botanical Garden', distanceKm: 4.7, category: 'Nature', rating: 4.7, lat: 12.9507, lng: 77.5848, image: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1000&q=80' },
  { id: 4, city: 'Bengaluru', name: 'Bangalore Palace', distanceKm: 4.8, category: 'Palace', rating: 4.5, lat: 12.9987, lng: 77.5920, image: 'https://images.unsplash.com/photo-1600100397608-f010f19b6f8f?auto=format&fit=crop&w=1000&q=80' },
  { id: 5, city: 'Bengaluru', name: 'Cubbon Park', distanceKm: 3.1, category: 'Park', rating: 4.6, lat: 12.9763, lng: 77.5929, image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=80' },
  { id: 6, city: 'Bengaluru', name: 'Nandi Hills', distanceKm: 60, category: 'Viewpoint', rating: 4.6, lat: 13.3702, lng: 77.6835, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1000&q=80' },
  { id: 7, city: 'Coimbatore', name: 'Isha Yoga Center', distanceKm: 30, category: 'Spiritual', rating: 4.7, lat: 10.9779, lng: 76.7409, image: 'https://images.unsplash.com/photo-1600100397608-f010f19b6f8f?auto=format&fit=crop&w=1000&q=80' },
  { id: 8, city: 'Coimbatore', name: 'Gedee Car Museum', distanceKm: 3.5, category: 'Museum', rating: 4.5, lat: 11.0068, lng: 76.9729, image: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?auto=format&fit=crop&w=1000&q=80' },
  { id: 9, city: 'Madurai', name: 'Meenakshi Amman Temple', distanceKm: 1.4, category: 'Heritage', rating: 4.9, lat: 9.9195, lng: 78.1193, image: 'https://images.unsplash.com/photo-1590766940554-634a7ed41450?auto=format&fit=crop&w=1000&q=80' },
  { id: 10, city: 'Mysuru', name: 'Mysore Palace', distanceKm: 2.0, category: 'Palace', rating: 4.9, lat: 12.3052, lng: 76.6552, image: 'https://images.unsplash.com/photo-1600112356915-089abb8fc71a?auto=format&fit=crop&w=1000&q=80' },
  { id: 11, city: 'Ooty', name: 'Government Botanical Garden', distanceKm: 2.4, category: 'Nature', rating: 4.7, lat: 11.4189, lng: 76.7114, image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=80' },
  { id: 12, city: 'Ooty', name: 'Ooty Lake', distanceKm: 1.9, category: 'Lake', rating: 4.5, lat: 11.4064, lng: 76.6932, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1000&q=80' }
];
