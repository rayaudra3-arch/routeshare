import { z } from 'zod';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(2).max(160)
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  role: z.enum(['Rider', 'Driver'])
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1)
});

export const createTripSchema = z.object({
  startLocation: latLngSchema,
  endLocation: latLngSchema,
  departureTime: z.string().datetime(),
  maxCapacity: z.number().int().min(1).max(8)
});

export const createBookingSchema = z.object({
  tripId: z.string().uuid(),
  pickupLocation: latLngSchema,
  dropoffLocation: latLngSchema
});

export const matchDecisionSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['Accepted', 'Rejected'])
});

export const contextSchema = z.object({
  role: z.enum(['Rider', 'Driver'])
});
