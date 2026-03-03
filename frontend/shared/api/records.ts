/**
 * Agent data records APIs
 */

import { http } from "./http";

export const fetchNmRecords = () =>
  http.get("/api/agents/nm/records");

export const fetchKbRecords = () =>
  http.get("/api/agents/kb/records");

export const deleteKbRecord = (recordId: string) =>
  http.delete(`/api/agents/kb/records/${recordId}`);
