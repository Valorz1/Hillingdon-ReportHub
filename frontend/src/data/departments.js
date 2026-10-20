// Departments the triage system can route to. The `id` is what the
// backend stores; `name` is what the dashboard shows. Order roughly
// matches Hillingdon Council's actual service tree as seen on
// hillingdon.gov.uk — adjust freely.
//
// Shared with backend pair — copy this list (or pull it via an API
// endpoint) when seeding the Java side.
export const DEPARTMENTS = [
  { id: 'housing',         name: 'Housing',                  description: 'Repairs, tenancies, allocations' },
  { id: 'streets',         name: 'Streets & Waste',          description: 'Fly-tipping, missed bins, street cleaning, potholes' },
  { id: 'parking',         name: 'Parking',                  description: 'Permits, fines, enforcement' },
  { id: 'environment',     name: 'Environment',              description: 'Noise, pollution, pest control, air quality' },
  { id: 'planning',        name: 'Planning',                 description: 'Applications, building control, permissions' },
  { id: 'council-tax',     name: 'Council Tax',              description: 'Billing, discounts, exemptions' },
  { id: 'antisocial',      name: 'Anti-Social Behaviour',    description: 'ASB reports, neighbour disputes' },
  { id: 'social-services', name: 'Social Services',          description: 'Adult & child services, safeguarding' },
  { id: 'general',         name: 'General Enquiries',        description: 'Catch-all for low-confidence + un-routable' },
]

export const departmentById = (id) =>
  DEPARTMENTS.find(d => d.id === id) || DEPARTMENTS.find(d => d.id === 'general')
