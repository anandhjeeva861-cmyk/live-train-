// Deterministic synthetic services. Coordinates/routes are illustrative, not track surveys.
export function expandCatalog(stations, trains) {
  const extra = [
    ['NDLS','New Delhi',28.643,77.219], ['AGC','Agra',27.157,77.99],
    ['JHS','Jhansi',25.444,78.568], ['BPL','Bhopal',23.268,77.413],
    ['NGP','Nagpur',21.153,79.088], ['SC','Hyderabad',17.434,78.501],
    ['BZA','Vijayawada',16.519,80.619], ['VSKP','Visakhapatnam',17.723,83.289],
    ['BBS','Bhubaneswar',20.266,85.844], ['HWH','Howrah',22.583,88.342],
    ['CSMT','Mumbai',18.94,72.835], ['PUNE','Pune',18.529,73.874],
    ['SUR','Solapur',17.664,75.893], ['ADI','Ahmedabad',23.026,72.601],
    ['ST','Surat',21.205,72.841], ['JP','Jaipur',26.92,75.787],
    ['LKO','Lucknow',26.831,80.924], ['BSB','Varanasi',25.327,82.986],
    ['PNBE','Patna',25.603,85.138], ['ERS','Kochi',9.97,76.29],
    ['TVC','Thiruvananthapuram',8.488,76.952], ['CLT','Kozhikode',11.246,75.781],
    ['MAQ','Mangaluru',12.864,74.843], ['MAO','Madgaon',15.267,73.971]
  ];
  extra.forEach(([code, city, lat, lng]) => stations.push({code, city, name: `${city} Junction`, lat, lng}));
  const corridors = [
    ['NDLS','AGC','JHS','BPL','NGP','SC','BZA','MAS'],
    ['CSMT','PUNE','SUR','SC','BZA'], ['HWH','BBS','VSKP','BZA','MAS'],
    ['ADI','ST','CSMT','PUNE'], ['NDLS','JP','ADI'],
    ['NDLS','LKO','BSB','PNBE','HWH'], ['TVC','ERS','CLT','MAQ','MAO','CSMT'],
    ['SC','NGP','BPL','JHS'], ['PUNE','SUR','SC','BZA','VSKP'],
    ['ERS','CBE','SA','JTJ','KPD','MAS']
  ];
  const clock = m => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  for (let i = 0; i < 1200; i++) {
    const codes = [...corridors[i % corridors.length]];
    if (Math.floor(i / corridors.length) % 2) codes.reverse();
    const route = codes.map(c => ({...stations.find(s => s.code === c)}));
    const from = route[0], to = route.at(-1), departure = (i * 17) % 1440;
    const minutes = (route.length - 1) * 155 + (i % 5) * 15;
    const type = i % 12 === 0 ? 'tourism' : 'normal';
    trains.push({ id: `mock-${i + 1}`, number: String(70000 + i),
      name: `${from.city} ${to.city} ${['Express','Superfast','Intercity','Mail'][i % 4]} ${Math.floor(i / 20) + 1}`,
      type, from, to, departure: clock(departure), arrival: clock(departure + minutes),
      duration: `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2,'0')}m`,
      rating: +(4 + (i % 10) / 10).toFixed(1),
      fare: type === 'tourism' ? {EV: 1200 + i % 900, PC: 2300 + i % 900} : {SL: 250 + i % 500, '3A': 850 + i % 1000, '2A': 1350 + i % 1500},
      seats: type === 'tourism' ? {EV: 24 + i % 40, PC: 12 + i % 20} : {SL: 40 + i % 140, '3A': 20 + i % 60, '2A': 10 + i % 30},
      route, simulated: true
    });
  }
}
