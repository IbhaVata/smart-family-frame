import type { CalendarEvent, Note, Reminder, Schedule } from '@/types';
import { newId } from '@/utils/id';
import { toDateKey, addDays } from '@/utils/time';
import { saveEvent, saveNote, saveReminder, saveSchedules } from './dataService';
import { addGeneratedPhoto } from './photoService';
import { photosStore } from '@/app/stores';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function demoSchedules(): Schedule[] {
  return [
    { id: newId(), name: 'Morning clock', startTime: '06:30', endTime: '07:00', daysOfWeek: ALL_DAYS, mode: 'CLOCK', enabled: true, priority: 1 },
    { id: newId(), name: 'Morning calendar', startTime: '07:00', endTime: '08:00', daysOfWeek: ALL_DAYS, mode: 'CALENDAR', enabled: true, priority: 1 },
    { id: newId(), name: 'Daytime photos', startTime: '08:00', endTime: '18:00', daysOfWeek: ALL_DAYS, mode: 'PHOTOS', enabled: true, priority: 1 },
    { id: newId(), name: 'Evening notes', startTime: '18:00', endTime: '18:15', daysOfWeek: ALL_DAYS, mode: 'NOTES', enabled: true, priority: 1 },
    { id: newId(), name: 'Evening photos', startTime: '18:15', endTime: '22:00', daysOfWeek: ALL_DAYS, mode: 'PHOTOS', enabled: true, priority: 1 },
    { id: newId(), name: 'Night clock', startTime: '22:00', endTime: '23:00', daysOfWeek: ALL_DAYS, mode: 'CLOCK', enabled: true, priority: 1 },
    { id: newId(), name: 'Night mode', startTime: '23:00', endTime: '06:30', daysOfWeek: ALL_DAYS, mode: 'NIGHT', enabled: true, priority: 1 },
  ];
}

function demoEvents(now: Date): Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>[] {
  const today = toDateKey(now);
  return [
    { title: 'Doctor Appointment', date: today, startTime: '16:00', endTime: '16:45', description: 'Dr. Patel, bring insurance card', allDay: false },
    { title: 'Family dinner', date: today, startTime: '20:00', endTime: '21:30', description: 'Everyone is home tonight', allDay: false },
    { title: 'Piano lesson', date: toDateKey(addDays(now, 1)), startTime: '17:30', endTime: '18:15', description: '', allDay: false },
    { title: "Grandma's birthday", date: toDateKey(addDays(now, 3)), description: 'Cake at 5', allDay: true },
    { title: 'School trip', date: toDateKey(addDays(now, 6)), startTime: '08:00', endTime: '15:00', description: 'Pack lunch', allDay: false },
  ];
}

function demoNotes(): Omit<Note, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    { title: 'Dinner with family at 8 PM', message: 'Dad is cooking. Please be home by 7:45!', pinned: true },
    { title: 'Grocery list', message: 'Milk, eggs, bread, apples, coffee', pinned: true },
    { title: 'Wi-Fi password', message: 'Ask a family member', pinned: false },
  ];
}

function demoReminders(now: Date): Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt'>[] {
  const today = toDateKey(now);
  return [
    { title: 'Call Mom', message: 'She loves hearing from you', date: today, time: '19:00', repeat: 'DAILY', enabled: true },
    { title: 'Take vitamins', message: '', date: today, time: '08:30', repeat: 'DAILY', enabled: true },
    { title: 'Water the plants', message: 'Balcony and kitchen', date: today, time: '18:00', repeat: 'WEEKLY', enabled: true },
  ];
}

/* ---- Locally generated demo photographs (no internet needed) ---- */

interface Scene {
  name: string;
  w: number;
  h: number;
  sky: [string, string];
  ground: string;
  sun: string;
  hills: { x: number; width: number; height: number; color: string }[];
}

const SCENES: Scene[] = [
  { name: 'demo-golden-hour.png', w: 1920, h: 1080, sky: ['#f7c59f', '#e07a5f'], ground: '#5b3a29', sun: '#fff1c1', hills: [{ x: 0.3, width: 0.5, height: 0.35, color: '#8a4b34' }, { x: 0.75, width: 0.6, height: 0.28, color: '#6e3c2a' }] },
  { name: 'demo-lake-morning.png', w: 1920, h: 1080, sky: ['#cfe7f5', '#7fb3d5'], ground: '#2f4f5f', sun: '#ffffff', hills: [{ x: 0.2, width: 0.6, height: 0.3, color: '#4e6f80' }, { x: 0.7, width: 0.8, height: 0.22, color: '#3d5a6b' }] },
  { name: 'demo-evening-walk.png', w: 1080, h: 1620, sky: ['#3b2a4f', '#c96f4a'], ground: '#241a1e', sun: '#ffd9a0', hills: [{ x: 0.5, width: 0.9, height: 0.25, color: '#42303b' }] },
  { name: 'demo-spring-meadow.png', w: 1920, h: 1280, sky: ['#dff0ff', '#9bd0f0'], ground: '#5a8f3c', sun: '#fff7d6', hills: [{ x: 0.35, width: 0.7, height: 0.3, color: '#6fa64a' }, { x: 0.85, width: 0.7, height: 0.2, color: '#4f8034' }] },
  { name: 'demo-desert-dusk.png', w: 1600, h: 1200, sky: ['#f0c27b', '#4b1248'], ground: '#a0522d', sun: '#ffe4b5', hills: [{ x: 0.25, width: 0.5, height: 0.22, color: '#7a3b2e' }, { x: 0.7, width: 0.5, height: 0.3, color: '#5c2a22' }] },
  { name: 'demo-portrait-garden.png', w: 1200, h: 1600, sky: ['#ffe9d6', '#f4a261'], ground: '#3a5a40', sun: '#fffbea', hills: [{ x: 0.4, width: 0.8, height: 0.3, color: '#588157' }] },
];

function renderScene(scene: Scene): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.w;
  canvas.height = scene.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const { w, h } = scene;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // sun
  ctx.beginPath();
  ctx.fillStyle = scene.sun;
  ctx.shadowColor = scene.sun;
  ctx.shadowBlur = Math.min(w, h) * 0.08;
  ctx.arc(w * 0.68, h * 0.32, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // hills
  for (const hill of scene.hills) {
    ctx.fillStyle = hill.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const cx = w * hill.x;
    const hw = w * hill.width;
    const top = h * (1 - hill.height);
    ctx.lineTo(cx - hw, h);
    ctx.quadraticCurveTo(cx, top - h * 0.1, cx + hw, h);
    ctx.closePath();
    ctx.fill();
  }
  // ground
  ctx.fillStyle = scene.ground;
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  // subtle grain
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = i % 2 ? '#000' : '#fff';
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.round(Math.min(w, h) * 0.035)}px Georgia, serif`;
  ctx.textAlign = 'right';
  ctx.fillText('Demo photo', w * 0.96, h * 0.08);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export interface DemoLoadResult {
  events: number;
  notes: number;
  reminders: number;
  schedules: number;
  photos: number;
}

/** Loads the demo content. Safe to call multiple times (photos are only added when the library has none). */
export async function loadDemoData(now: Date = new Date()): Promise<DemoLoadResult> {
  const result: DemoLoadResult = { events: 0, notes: 0, reminders: 0, schedules: 0, photos: 0 };
  for (const e of demoEvents(now)) {
    await saveEvent(e);
    result.events++;
  }
  for (const n of demoNotes()) {
    await saveNote(n);
    result.notes++;
  }
  for (const r of demoReminders(now)) {
    await saveReminder(r);
    result.reminders++;
  }
  const schedules = demoSchedules();
  await saveSchedules(schedules);
  result.schedules = schedules.length;
  if (photosStore.get().length === 0) {
    for (const scene of SCENES) {
      const blob = await renderScene(scene);
      if (!blob) continue;
      const meta = await addGeneratedPhoto(scene.name, blob, scene.name.includes('golden'));
      if (meta) result.photos++;
    }
  }
  return result;
}
