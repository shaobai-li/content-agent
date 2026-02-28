/**
 * Agent data records APIs
 */

import { http } from "./http";

export const fetchNmRecords = () =>
  http.get("/api/nm/records");

export const fetchKbRecords = () =>
  http.get("/api/kb/records");
