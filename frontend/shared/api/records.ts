/**
 * Agent data records APIs
 */

import { http } from "./http";

export const fetchNmRecords = () =>
  http.get("/api/agents/nm/res/records");

export const fetchKbRecords = () =>
  http.get("/api/agents/kb/res/records");

export const deleteKbRecord = (recordId: string) =>
  http.delete(`/api/agents/kb/res/records/${recordId}`);

export const deleteNmRecord = (recordId: string) =>
  http.delete(`/api/agents/nm/res/records/${recordId}`);
