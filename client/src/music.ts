import { useEffect, useState } from "react";

const MUSIC_URL = "/cancel_with_leslie_backing.mp3";
const STORAGE_KEY = "cancel:musicMuted";
const VOLUME = 0.35;

let audio: HTMLAudioElement | null = null;
let started = false;
let initialized = false;
let unlocked = false;
const listeners = new Set<(muted: boolean) => void>();
const unlockedListeners = new Set<(u: boolean) => void>();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(m: boolean) {
  try {
    if (m) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(MUSIC_URL);
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = "auto";
  return audio;
}

function notify(m: boolean) {
  for (const l of listeners) l(m);
}

export function isMusicMuted(): boolean {
  return loadMuted();
}

export function setMusicMuted(muted: boolean) {
  saveMuted(muted);
  const a = getAudio();
  if (muted) {
    a.pause();
  } else {
    // Needs a user gesture in the call stack (the toggle click counts).
    // Catch is required: a play() promise rejection on autoplay block must
    // not surface as an unhandled rejection.
    void a.play().catch(() => {});
  }
  notify(muted);
}

export function initMusic() {
  if (initialized) return;
  initialized = true;
  getAudio();

  const onFirstInteraction = () => {
    if (started) return;
    started = true;
    document.removeEventListener("pointerdown", onFirstInteraction, true);
    document.removeEventListener("keydown", onFirstInteraction, true);
    document.removeEventListener("touchstart", onFirstInteraction, true);
    if (!loadMuted()) {
      void getAudio().play().catch(() => {});
    }
    unlocked = true;
    for (const l of unlockedListeners) l(true);
  };
  document.addEventListener("pointerdown", onFirstInteraction, true);
  document.addEventListener("keydown", onFirstInteraction, true);
  document.addEventListener("touchstart", onFirstInteraction, true);
}

export function useMusicMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  useEffect(() => {
    listeners.add(setMuted);
    return () => void listeners.delete(setMuted);
  }, []);
  return [muted, () => setMusicMuted(!loadMuted())];
}

export function useMusicUnlocked(): boolean {
  const [u, setU] = useState<boolean>(() => unlocked);
  useEffect(() => {
    if (unlocked) {
      setU(true);
      return;
    }
    unlockedListeners.add(setU);
    return () => void unlockedListeners.delete(setU);
  }, []);
  return u;
}
