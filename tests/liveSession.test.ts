import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connect, close } = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { live = { connect }; models = { generateContent: vi.fn() }; },
  Modality: { AUDIO: 'AUDIO' },
  Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
}));
import { ChatBot } from '../components/ChatBot';

const track = () => ({ stop: vi.fn() });
let tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
let contexts: Array<{ close: ReturnType<typeof vi.fn>; state: string }>;

beforeEach(() => {
  tracks = [track(), track()];
  contexts = [];
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    destination = {};
    close = vi.fn(async () => { this.state = 'closed'; });
    constructor() { contexts.push(this as any); }
    createGain() { return { connect: vi.fn() }; }
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) },
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ token: 'auth_tokens/test', model: 'live-model' }), { status: 200 })));
  vi.stubGlobal('alert', vi.fn());
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  Element.prototype.scrollIntoView = vi.fn();
  connect.mockReset();
  close.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderChat() {
  render(React.createElement(ChatBot, {
    contextData: { siteInfo: { name: 'Synthetic Site' }, rooms: [] },
    privacyMode: false, mode: 'single', messages: [], setMessages: vi.fn(),
  }));
  fireEvent.click(screen.getAllByRole('button')[0]); // open the chat panel
}
const startButton = () => screen.getByText('videocam').closest('button')!;
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe('Live AI session always releases camera, microphone and session', () => {
  it('uses a server-minted token, never a bundled key', async () => {
    connect.mockResolvedValue({ close, sendRealtimeInput: vi.fn() });
    renderChat();
    fireEvent.click(startButton());
    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/live-token', expect.objectContaining({ method: 'POST' }));
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ model: 'live-model' }));
  });

  it('cleans up when the user stops before the session opens', async () => {
    connect.mockResolvedValue({ close, sendRealtimeInput: vi.fn() }); // onopen never fires
    renderChat();
    fireEvent.click(startButton());
    await flush();
    fireEvent.click(screen.getByText('call_end').closest('button')!);
    await flush();
    tracks.forEach(t => expect(t.stop).toHaveBeenCalled());
    expect(close).toHaveBeenCalled();
    contexts.forEach(c => expect(c.close).toHaveBeenCalled());
  });

  it('cleans up when the connection fails', async () => {
    connect.mockRejectedValue(new Error('network down'));
    renderChat();
    fireEvent.click(startButton());
    await flush();
    tracks.forEach(t => expect(t.stop).toHaveBeenCalled());
    contexts.forEach(c => expect(c.close).toHaveBeenCalled());
    expect(screen.getByText('videocam')).toBeTruthy(); // back to the idle state
  });

  it('cleans up on unmount', async () => {
    connect.mockResolvedValue({ close, sendRealtimeInput: vi.fn() });
    renderChat();
    fireEvent.click(startButton());
    await flush();
    cleanup();
    await flush();
    tracks.forEach(t => expect(t.stop).toHaveBeenCalled());
    expect(close).toHaveBeenCalled();
  });

  it('reports a missing server token without touching the camera', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Live AI is not configured' } }), { status: 503 })));
    renderChat();
    fireEvent.click(startButton());
    await flush();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Live AI is not configured'));
  });
});
