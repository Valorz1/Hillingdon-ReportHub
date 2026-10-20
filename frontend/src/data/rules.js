// Tier-1 keyword rules for the triage classifier. Each rule fires when
// any of its `keywords` appears as a whole word (case-insensitive, an
// optional plural "s"/"es" allowed) in the report's subject + description.
//
// Weights:
//   3 = strong signal, e.g. literal department name or unambiguous noun
//   2 = solid signal, common topic word
//   1 = weak signal, only counts if no stronger rule fires
//
// Mirrored in backend/app/classifier.py — keep the two in sync.
export const RULES = {
  housing: {
    3: ['housing officer', 'council house', 'tenancy', 'eviction', 'right to buy'],
    2: ['leak', 'boiler', 'heating', 'damp', 'mould', 'repair', 'landlord', 'tenant', 'rent', 'flat', 'maisonette'],
    1: ['kitchen', 'bathroom', 'window', 'door', 'roof'],
  },
  streets: {
    3: ['fly-tipping', 'fly tipping', 'fly-tipped', 'missed bin', 'pothole', 'rubbish dumped'],
    2: ['bin', 'rubbish', 'waste', 'litter', 'street cleaning', 'pavement', 'kerb', 'graffiti', 'dog mess', 'fallen tree', 'streetlight', 'street light'],
    1: ['road', 'street', 'path', 'broken', 'junction'],
  },
  parking: {
    3: ['parking permit', 'pcn', 'parking fine', 'parking ticket', 'cpz', 'controlled parking zone'],
    2: ['parking', 'parked', 'double yellow', 'yellow lines', 'enforcement', 'tow'],
    1: ['car', 'vehicle', 'driveway'],
  },
  environment: {
    3: ['noise complaint', 'pest control', 'air quality', 'rats infestation'],
    2: ['noise', 'loud music', 'barking', 'pollution', 'smell', 'odour', 'rats', 'mice', 'pigeons', 'pests', 'fumes'],
    1: ['neighbour', 'late night', 'smoke'],
  },
  planning: {
    3: ['planning application', 'planning permission', 'building control', 'listed building', 'conservation area'],
    2: ['planning', 'extension', 'development', 'construction', 'permitted development'],
    1: ['build', 'building'],
  },
  'council-tax': {
    3: ['council tax', 'single person discount', 'council tax bill'],
    2: ['tax bill', 'tax exemption', 'tax band', 'arrears', 'direct debit', 'rebate'],
    1: ['bill', 'payment', 'invoice'],
  },
  antisocial: {
    3: ['anti-social behaviour', 'antisocial behaviour', 'asb', 'harassment', 'intimidation'],
    2: ['threat', 'shouting', 'aggressive', 'drug dealing', 'gang', 'vandalism'],
    1: ['fight', 'argument', 'scared'],
  },
  'social-services': {
    3: ['safeguarding', 'child protection', 'adult social care', 'child at risk', 'vulnerable adult'],
    2: ['care home', 'foster', 'social worker', 'mental health', 'elderly', 'disability', 'carer'],
    1: ['child', 'family', 'support'],
  },
}
