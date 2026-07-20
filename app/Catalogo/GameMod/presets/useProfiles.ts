import { useState, useEffect, useCallback } from "react";
import type { ProfileEntry } from "../ui/types/mod.types";

export function useProfiles(gameId: string) {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");

  useEffect(() => {
    if (!gameId) { setProfiles([]); return; }
    (async () => {
      try {
        const ps: ProfileEntry[] = (await window.electron.modsStore.get(`game:${gameId}:profiles`)) as ProfileEntry[] || [];
        if (ps.length === 0) {
          const defaultProfile: ProfileEntry = { name: "Default", active: true };
          const initialized = [defaultProfile];
          setProfiles(initialized);
          setSelectedProfile("Default");
          await window.electron.modsStore.put(`game:${gameId}:profiles`, initialized);
        } else {
          setProfiles(ps);
          setSelectedProfile(ps[0].name);
        }
      } catch { setProfiles([]); }
    })();
  }, [gameId]);

  const createProfile = useCallback(async (name: string) => {
    if (!name.trim() || !gameId) return false;
    const updated = [...profiles, { name, active: true }];
    setProfiles(updated);
    await window.electron.modsStore.put(`game:${gameId}:profiles`, updated);
    setSelectedProfile(name);
    return true;
  }, [gameId, profiles]);

  const deleteProfile = useCallback(async (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    await window.electron.modsStore.put(`game:${gameId}:profiles`, updated);
    if (selectedProfile === name && updated.length > 0) {
      setSelectedProfile(updated[0].name);
    }
  }, [gameId, profiles, selectedProfile]);

  return {
    profiles,
    selectedProfile,
    setSelectedProfile,
    createProfile,
    deleteProfile,
  };
}
