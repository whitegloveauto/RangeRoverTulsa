"use client";

// Lightweight client store for the vehicle selection, persisted in
// sessionStorage so it survives the navigation from /portal/vehicle to
// /portal/pricing without a global state library.

export interface SelectedVehicle {
  year: number;
  model: string;
  trim: string;
}

const KEY = "wga_dealer_vehicle";

export function setSelectedVehicle(v: SelectedVehicle) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(v));
}

export function getSelectedVehicle(): SelectedVehicle | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SelectedVehicle;
  } catch {
    return null;
  }
}

export function clearSelectedVehicle() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
