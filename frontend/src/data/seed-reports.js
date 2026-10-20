// Synthetic reports for demoing the dashboard. Mix of clear
// single-department cases + ambiguous edge cases that should land in
// low-confidence / general for the demo's "human-in-the-loop" beat.
// A couple of fly-tipping and pothole reports sit within a few metres
// of each other so the dashboard's duplicate detection has something
// to find.
//
// Each gets classified at runtime by the JS classifier (lib/classifier),
// the same algorithm as backend/app/classifier.py.
//
// backend/demo_reports.json is generated from this file (run in frontend/):
//   node -e "import('./src/data/seed-reports.js').then(m => require('fs').writeFileSync('../backend/demo_reports.json', JSON.stringify(m.SEED_REPORTS, null, 2)))"
export const SEED_REPORTS = [
  // --- Streets & Waste (the hackathon brief: road hazards + fly-tipping) ---
  { subject: 'Fly-tipping behind shops',
    description: 'Big pile of rubbish dumped behind the parade of shops, mattresses and bin bags.',
    location: 'Behind High Street parade, Uxbridge', lat: 51.54612, lng: -0.47941 },
  { subject: 'Mattresses dumped in service road',
    description: 'Someone has fly-tipped two mattresses and a sofa in the service road behind the High Street.',
    location: 'Service road, High Street, Uxbridge', lat: 51.54598, lng: -0.47912, status: 'in-progress' },
  { subject: 'Pothole on main road',
    description: 'Large pothole near the junction, damaged my tyre this morning.',
    location: 'Cowley Road near Tesco, Uxbridge', lat: 51.53201, lng: -0.47977, reporter: 'fakeemail@gmail.com' },
  { subject: 'Deep pothole by bus stop',
    description: 'Very deep pothole right by the bus stop on Cowley Road, cyclists are swerving into traffic to avoid it.',
    location: 'Cowley Road bus stop, Uxbridge', lat: 51.53188, lng: -0.47952 },
  { subject: 'Missed bin collection',
    description: 'Black bin not collected this week, was put out before 7am as usual.',
    location: '8 Willow Crescent, Hayes', lat: 51.51210, lng: -0.41980, status: 'resolved', reporter: 'fakeemail@gmail.com' },
  { subject: 'Graffiti on bus shelter',
    description: 'Spray-painted tags on the bus shelter, been there a few weeks.',
    location: 'Station Road, West Drayton', lat: 51.50695, lng: -0.47195 },
  { subject: 'Fallen tree blocking pavement',
    description: 'A fallen tree is blocking the whole pavement after last night\'s wind, people are walking in the road.',
    location: 'Swakeleys Road, Ickenham', lat: 51.56090, lng: -0.44980 },

  // --- Housing ---
  { subject: 'Boiler not working',
    description: 'My boiler has stopped working in my council flat. No heating or hot water for 2 days.',
    location: '12 Oak Avenue, Uxbridge', lat: 51.54980, lng: -0.47100, status: 'in-progress', reporter: 'fakeemail@gmail.com' },
  { subject: 'Damp on bedroom wall',
    description: 'Black mould has appeared on the bedroom wall, damp is getting worse. I rent from the council.',
    location: '45 Elm Road, Hayes', lat: 51.51530, lng: -0.42310 },
  { subject: 'Tenancy renewal question',
    description: 'My tenancy is up for renewal, the housing officer hasn\'t replied for 3 weeks.' },

  // --- Parking ---
  { subject: 'Disputing parking fine',
    description: 'Got a PCN but the signage was unclear. Want to appeal the parking ticket.', status: 'closed' },
  { subject: 'Resident parking permit',
    description: 'Need to renew my parking permit, the website form is broken.' },
  { subject: 'Car parked on double yellow lines',
    description: 'Same car parks on the double yellow every day, blocking the corner.',
    location: 'Belmont Road, Uxbridge', lat: 51.54790, lng: -0.48210 },

  // --- Environment ---
  { subject: 'Noise complaint about neighbour',
    description: 'Loud music every night until 2am from next door, this has been going on for months.',
    location: '23 Maple Drive, Ickenham', lat: 51.56210, lng: -0.44420 },
  { subject: 'Rats in garden',
    description: 'Pest control issue — rats nesting in the back garden, need pest control to come.', status: 'resolved' },
  { subject: 'Air quality concern near school',
    description: 'Heavy traffic outside the primary school causing fumes, worried about children\'s air quality.' },

  // --- Planning ---
  { subject: 'Neighbour built extension without permission',
    description: 'Next door has built a big rear extension, I don\'t think they got planning permission.' },
  { subject: 'Planning application enquiry',
    description: 'Want to submit a planning application for a loft conversion, where do I start?' },

  // --- Council Tax ---
  { subject: 'Single person discount',
    description: 'I live alone but my council tax bill doesn\'t show the single person discount.', status: 'resolved' },
  { subject: 'Council tax band query',
    description: 'I think my council tax band is wrong compared to similar properties on my street.' },

  // --- Anti-social behaviour ---
  { subject: 'ASB harassment from group of teens',
    description: 'Group of teenagers gathering outside my house every evening, intimidation, shouting threats.' },
  { subject: 'Suspected drug dealing',
    description: 'Cars stopping briefly outside the flat next door at all hours, anti-social behaviour pattern.' },

  // --- Social Services ---
  { subject: 'Worried about elderly neighbour',
    description: 'My elderly neighbour has dementia and lives alone, I think they need a social worker visit.' },
  { subject: 'Safeguarding concern',
    description: 'I have a child protection concern about a child on my street — vulnerable, possibly at risk.' },

  // --- Ambiguous / multi-department (demo: "low confidence → general queue") ---
  { subject: 'Neighbour problem',
    description: 'My neighbour\'s dog barks all the time AND they keep dumping rubbish on the front lawn. It\'s been going on for ages.' },
  { subject: 'Help with my flat',
    description: 'I need help with my flat, lots of issues, please get back to me.' },
  { subject: 'General complaint',
    description: 'The council is not doing enough about issues in my area.' },
  { subject: 'Loud building work',
    description: 'New construction site next door, very noisy, started early in the morning. Is it a planning thing or noise?' },
]
