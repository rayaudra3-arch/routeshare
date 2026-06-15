export type Role = 'Rider' | 'Driver';
export type TripStatus = 'Pending' | 'Active' | 'Completed' | 'Cancelled';
export type MatchStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Paid' | 'Cancelled';
export type CheckInStatus = 'Pending' | 'RiderInitiated' | 'DriverChecked' | 'RiderConfirmed';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  authorizedRoles: Role[];
  verifiedStatus: 'Pending' | 'Verified' | 'Rejected';
}
