import { Client, UnitSystem } from '@googlemaps/google-maps-services-js';
import { addSeconds } from 'date-fns';
import { config } from '../config.js';

export interface Point {
  lat: number;
  lng: number;
  label: string;
}

export interface MatchEstimate {
  fareAmountCents: number;
  detourSeconds: number;
  matchScore: number;
  etaPickupTime: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

const maps = new Client({});
const MAX_DETOUR_SECONDS = 15 * 60;
const MAX_DETOUR_RATIO = 0.25;

function haversineMeters(a: Point, b: Point): number {
  const earth = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

async function routeLeg(origin: Point, destination: Point): Promise<{ distanceMeters: number; durationSeconds: number }> {
  if (!config.GOOGLE_MAPS_API_KEY) {
    const distanceMeters = haversineMeters(origin, destination) * 1.25;
    return { distanceMeters, durationSeconds: Math.round(distanceMeters / 15.6) };
  }

  const response = await maps.distancematrix({
    params: {
      key: config.GOOGLE_MAPS_API_KEY,
      origins: [{ lat: origin.lat, lng: origin.lng }],
      destinations: [{ lat: destination.lat, lng: destination.lng }],
      units: UnitSystem.imperial
    }
  });
  const element = response.data.rows[0]?.elements[0];
  if (!element || element.status !== 'OK') throw new Error('Google Distance Matrix could not estimate route leg');
  return { distanceMeters: element.distance.value, durationSeconds: element.duration.value };
}

export async function estimateDriverBaseRoute(start: Point, end: Point) {
  return routeLeg(start, end);
}

export async function estimateRiderMatch(params: {
  start: Point;
  end: Point;
  pickup: Point;
  dropoff: Point;
  departureTime: string;
  baseDurationSeconds: number;
  baseDistanceMeters: number;
}): Promise<MatchEstimate> {
  const toPickup = await routeLeg(params.start, params.pickup);
  const pickupToDropoff = await routeLeg(params.pickup, params.dropoff);
  const dropoffToEnd = await routeLeg(params.dropoff, params.end);
  const totalDurationSeconds = toPickup.durationSeconds + pickupToDropoff.durationSeconds + dropoffToEnd.durationSeconds;
  const totalDistanceMeters = toPickup.distanceMeters + pickupToDropoff.distanceMeters + dropoffToEnd.distanceMeters;
  const detourSeconds = Math.max(0, totalDurationSeconds - params.baseDurationSeconds);
  const allowedDetour = Math.min(MAX_DETOUR_SECONDS, params.baseDurationSeconds * MAX_DETOUR_RATIO);

  if (detourSeconds > allowedDetour) {
    throw new Error('Requested fare exceeds route efficiency limits');
  }

  const etaPickupTime = addSeconds(new Date(params.departureTime), toPickup.durationSeconds).toISOString();
  const detourPenalty = Math.round((detourSeconds / Math.max(allowedDetour, 1)) * 45);
  const proximityBonus = Math.max(0, 35 - Math.round(toPickup.durationSeconds / 60));
  const matchScore = Math.max(1, Math.min(100, 100 - detourPenalty + proximityBonus));
  const fareAmountCents = Math.max(350, Math.round((pickupToDropoff.distanceMeters / 1609.34) * 125 + detourSeconds * 0.08));

  return { fareAmountCents, detourSeconds, matchScore, etaPickupTime, totalDistanceMeters, totalDurationSeconds };
}
