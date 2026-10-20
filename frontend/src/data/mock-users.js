// Mock user accounts. When USE_BACKEND=true these are ignored
// and the real POST /api/auth/login endpoint is used instead.
export const MOCK_USERS = [
  {
    accountId: 'LBH-2847-9135',
    email:     'admin@hillingdon.gov.uk',
    password:  'admin',
    name:      'Sarah Chen',
    address:   'Civic Centre, High Street, Uxbridge, UB8 1UW',
    role:      'admin',
  },
  {
    accountId: 'LBH-5512-0374',
    email:     'fakeemail@gmail.com',
    password:  'password',
    name:      'James Patel',
    address:   '47 Maple Drive, Ickenham, Uxbridge, UB10 8NR',
    role:      'resident',
  },
]
