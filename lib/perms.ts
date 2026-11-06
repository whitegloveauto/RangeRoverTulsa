// What a White Glove Auto staff member can see on the dealer-program admin side.
// profiles.role = 'admin' always has everything; everyone else gets exactly what's ticked on /wga/team.
export const PERMS: { key: string; label: string; help: string }[] = [
  { key: "orders", label: "Orders", help: "See dealer orders, change status, assign, add QC photos, reply to requests" },
  { key: "comebacks", label: "Comebacks", help: "See and work warranty / comeback claims" },
  { key: "pricing", label: "Pricing", help: "Edit WGA cost, suggested retail, services, packages and packet copy" },
  { key: "vehicles", label: "Vehicles", help: "Edit the model / trim catalog and model photos" },
  { key: "dealerships", label: "Dealerships", help: "Manage dealerships, their logins, brands and hostnames" },
  { key: "view_as", label: "View as dealership", help: "Open the dealer portal as the dealership sees it" },
  { key: "team", label: "Team", help: "Manage who at White Glove Auto can see what (admins only)" },
];
export const ALL_PERMS = PERMS.map((p) => p.key);
export const DEFAULT_PERMS = ["orders"];
export const hasPerm = (s: { role: string; perms?: string[] } | null | undefined, key: string) => !!s && (s.role === "admin" || (s.perms || []).includes(key));
