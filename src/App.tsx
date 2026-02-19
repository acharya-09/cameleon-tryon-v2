import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  Camera,
  Upload,
  Play,
  Square,
  Sparkles,
  ImagePlus,
  Loader2,
  X,
  Download,
  MoveHorizontal,
} from 'lucide-react';

// Assets
import logoIcon from './assets/6233dd42c6e5f4d78a75023b52c3d4d714d37ad2.png';
import shopifyLogo from './assets/shopify.png';
import c1 from './assets/c1.png';
import c2 from './assets/c2.png';
import c3 from './assets/c3.png';
import c4 from './assets/c4.png';
import c5 from './assets/c5.png';
import c6 from './assets/c6.png';
import c7 from './assets/c7.png';

// ─── Pre-defined garments ───────────────────────────────────
const GARMENTS: { id: number; image: string; name: string }[] = [
  { id: 0, image: c1, name: 'Floral Jacket' },
  { id: 1, image: c2, name: 'Puffer Jacket' },
  { id: 2, image: c3, name: 'Pink Dress' },
  { id: 3, image: c4, name: 'Casual Top' },
  { id: 4, image: c5, name: 'Summer Outfit' },
  { id: 5, image: c6, name: 'Classic Look' },
  { id: 6, image: c7, name: 'Elegant Piece' },
];

// ─── Main App ───────────────────────────────────────────────
export default function App() {
  // Mode
  const [mode, setMode] = useState<'live' | 'photo'>('live');

  // Garment selection
  const [selectedGarment, setSelectedGarment] = useState<number | null>(null);
  const [customGarment, setCustomGarment] = useState<{
    url: string;
    file: File;
  } | null>(null);

  // Prompt & streaming
  const [prompt, setPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Photo mode
  const [photoUpload, setPhotoUpload] = useState<{
    url: string;
    file: File;
  } | null>(null);
  const [photoResult, setPhotoResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // A/B comparison
  const [showCompare, setShowCompare] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const compareContainerRef = useRef<HTMLDivElement>(null);
  const isCompareDragging = useRef(false);

  // Video recording (split view: output top, input bottom)
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordAnimFrameRef = useRef<number>(0);
  const recordMimeRef = useRef<string>('video/mp4');
  const recordRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs
  const inputVideoRef = useRef<HTMLVideoElement>(null);
  const outputVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const realtimeClientRef = useRef<any>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ─── Camera ─────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { frameRate: 25, width: 1280, height: 704 },
      });
      localStreamRef.current = stream;
      if (inputVideoRef.current) {
        inputVideoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch (err) {
      console.error('Camera access error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (inputVideoRef.current) {
      inputVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // ─── Video Recording (vertical split: output top, input bottom) ───
  const startRecording = useCallback(() => {
    const outVid = outputVideoRef.current;
    const inVid = inputVideoRef.current;
    if (!outVid || !inVid) return;

    // Retry until both video elements have real dimensions
    if (outVid.videoWidth === 0 || inVid.videoWidth === 0) {
      recordRetryRef.current = setTimeout(() => startRecording(), 300);
      return;
    }

    // Auto-size canvas to match actual video dimensions
    const targetW = Math.min(outVid.videoWidth, 1280);
    const outScale = targetW / outVid.videoWidth;
    const outH = Math.round(outVid.videoHeight * outScale);
    const inScale = targetW / inVid.videoWidth;
    const inH = Math.round(inVid.videoHeight * inScale);
    const W = targetW;
    const H = outH + inH;

    let canvas = recordCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      recordCanvasRef.current = canvas;
    }
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const drawFrame = () => {
      // Top: output (Lucy result), fill full width
      if (outVid.readyState >= 2 && outVid.videoWidth > 0) {
        ctx.drawImage(outVid, 0, 0, W, outH);
      }
      // Bottom: original webcam, fill full width
      if (inVid.readyState >= 2 && inVid.videoWidth > 0) {
        ctx.drawImage(inVid, 0, outH, W, inH);
      }
      recordAnimFrameRef.current = requestAnimationFrame(drawFrame);
    };

    recordAnimFrameRef.current = requestAnimationFrame(drawFrame);

    const stream = canvas.captureStream(30);
    recordedChunksRef.current = [];

    // Prefer MP4 (H.264) for universal playback, fall back to WebM
    let mimeType: string;
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
      mimeType = 'video/mp4;codecs=avc1';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else {
      mimeType = 'video/webm';
    }
    recordMimeRef.current = mimeType;

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
  }, []);

  const stopRecording = useCallback(() => {
    if (recordRetryRef.current) {
      clearTimeout(recordRetryRef.current);
      recordRetryRef.current = null;
    }
    cancelAnimationFrame(recordAnimFrameRef.current);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recordMimeRef.current });
        if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setShowRecordingModal(true);
        mediaRecorderRef.current = null;
        resolve();
      };
      recorder.stop();
    });
  }, [recordedVideoUrl]);

  // Start camera only in Live mode; stop when switching to Photo mode
  useEffect(() => {
    if (mode === 'live') {
      startCamera();
      return () => {
        stopCamera();
        realtimeClientRef.current?.disconnect();
      };
    }
    if (mode === 'photo') {
      stopCamera();
    }
    return () => {};
  }, [mode, startCamera, stopCamera]);

  // ─── Garment helpers ────────────────────────────────────
  const hasGarment =
    customGarment !== null || selectedGarment !== null;

  const getGarmentFile = useCallback(async (): Promise<File | null> => {
    if (customGarment) return customGarment.file;
    if (selectedGarment !== null && GARMENTS[selectedGarment]) {
      const resp = await fetch(GARMENTS[selectedGarment].image);
      const blob = await resp.blob();
      return new File([blob], 'garment.png', { type: blob.type });
    }
    return null;
  }, [customGarment, selectedGarment]);

  const handleGarmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setCustomGarment({ url, file });
      setSelectedGarment(null);
    }
    if (e.target) e.target.value = '';
  };

  const handleGarmentDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      setCustomGarment({ url: URL.createObjectURL(file), file });
      setSelectedGarment(null);
    }
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      setPhotoUpload({ url: URL.createObjectURL(file), file });
      setPhotoResult(null);
    }
  };

  // ─── Lucy Streaming ─────────────────────────────────────
  const stopStream = useCallback(async () => {
    await stopRecording();

    if (realtimeClientRef.current) {
      try {
        realtimeClientRef.current.disconnect();
      } catch {
        /* ignore */
      }
      realtimeClientRef.current = null;
    }
    if (outputVideoRef.current) {
      outputVideoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setIsConnecting(false);
  }, [stopRecording]);

  const startStream = async () => {
    const apiKey = import.meta.env.VITE_DECART_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      alert('Please set VITE_DECART_API_KEY in your .env file');
      return;
    }
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    if (!localStreamRef.current) {
      await startCamera();
      if (!localStreamRef.current) {
        alert('Camera not available. Please allow camera access.');
        return;
      }
    }

    setIsConnecting(true);

    // Disconnect any existing stream
    if (realtimeClientRef.current) {
      realtimeClientRef.current.disconnect();
      realtimeClientRef.current = null;
      await new Promise((r) => setTimeout(r, 300));
    }

    try {
      const { createDecartClient, models } = await import('@decartai/sdk');

      const garmentFile = await getGarmentFile();
      const modelName = garmentFile ? 'lucy_2_rt' : 'lucy_v2v_720p_rt';
      const model = models.realtime(modelName);
      const client = createDecartClient({ apiKey });

      const rtClient = await client.realtime.connect(
        localStreamRef.current!,
        {
          model,
          onRemoteStream: (editedStream: MediaStream) => {
            if (outputVideoRef.current) {
              outputVideoRef.current.srcObject = editedStream;
            }
            setIsStreaming(true);
            setIsConnecting(false);
            setTimeout(() => startRecording(), 300);
          },
        }
      );

      rtClient.on('error', (error: any) => {
        console.error('Stream error:', error);
        alert(`Stream error: ${error?.message || error}`);
        stopStream();
      });

      if (garmentFile) {
        rtClient
          .setImage(garmentFile)
          .catch((e: any) => console.error('Image set error:', e));
      }
      rtClient.setPrompt(prompt.trim());

      realtimeClientRef.current = rtClient;
    } catch (err: any) {
      console.error('Failed to start stream:', err);
      const msg = err?.message || String(err);
      if (
        msg.includes('Failed to resolve') ||
        msg.includes('Cannot find module')
      ) {
        alert('Decart SDK not found. Run: npm install @decartai/sdk');
      } else {
        alert(`Failed to start: ${msg}`);
      }
      setIsConnecting(false);
    }
  };

  // Cleanup on page unload
  useEffect(() => {
    const cleanup = () => {
      stopStream();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [stopStream]);

  // ─── Photo Mode: Generate via RunPod ────────────────────

  // Upload raw file to ImgBB (binary → proxy converts to base64 server-side)
  const uploadToImgBB = useCallback(async (file: File): Promise<string> => {
    const resp = await fetch('/api/imgbb', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    const data = await resp.json();
    if (!data.url) {
      throw new Error(data.error || JSON.stringify(data));
    }
    return data.url;
  }, []);

  const handleGenerate = async () => {
    if (!photoUpload || !hasGarment) return;

    setIsGenerating(true);
    setPhotoResult(null);

    try {
      // 1. Get garment file
      const garmentFile = await getGarmentFile();
      if (!garmentFile) throw new Error('No garment selected');

      // 2. Upload both to ImgBB in parallel (raw binary — fast)
      console.log('[generate] Uploading images to ImgBB...');
      const [modelUrl, garmentUrl] = await Promise.all([
        uploadToImgBB(photoUpload.file),
        uploadToImgBB(garmentFile),
      ]);
      console.log('[generate] Uploads done:', modelUrl, garmentUrl);

      // 3. Submit RunPod job (via server proxy — keys stay server-side)
      console.log('[generate] Submitting RunPod job...');
      const runResponse = await fetch('/api/runpod/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            request_id: `tryon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            model_img: modelUrl,
            cloth_img: garmentUrl,
            premium_user: true,
            output_format: 'jpg',
            output_quality: 95,
            url_expiration: 96400,
          },
        }),
      });
      const runResp = await runResponse.json();

      if (!runResp.id) {
        throw new Error(
          `[RunPod] Job submit failed (HTTP ${runResponse.status}): ${runResp.error || runResp.message || JSON.stringify(runResp)}`
        );
      }
      console.log('[generate] RunPod job submitted:', runResp.id, runResp.status);

      // 4. Poll for result (3s intervals, up to 3 min)
      const jobId = runResp.id;
      const maxAttempts = 60;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 3000));

        const statusResponse = await fetch(`/api/runpod/status/${jobId}`);
        const statusResp = await statusResponse.json();
        console.log(`[generate] Poll ${i + 1}: ${statusResp.status}`);

        if (statusResp.status === 'COMPLETED') {
          const imageUrl = statusResp.output?.[0]?.image;
          if (!imageUrl) throw new Error('[RunPod] Completed but no image URL in response');
          console.log('[generate] Done!');
          setPhotoResult(imageUrl);
          return;
        }

        if (statusResp.status === 'FAILED') {
          throw new Error(
            `[RunPod] Generation failed: ${JSON.stringify(statusResp.error || statusResp.output || 'Unknown error')}`
          );
        }
      }

      throw new Error('Generation timed out (3 min). Try again.');
    } catch (err: any) {
      console.error('Generate error:', err);
      alert(`Generation failed: ${err?.message || String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── A/B Compare slider ────────────────────────────────
  const updateComparePos = useCallback((clientX: number) => {
    if (!compareContainerRef.current) return;
    const rect = compareContainerRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setComparePos(pct);
  }, []);

  useEffect(() => {
    if (!showCompare) return;
    const onMove = (e: MouseEvent) => {
      if (isCompareDragging.current) updateComparePos(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isCompareDragging.current) updateComparePos(e.touches[0].clientX);
    };
    const onUp = () => {
      isCompareDragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [showCompare, updateComparePos]);

  const downloadResult = useCallback(async () => {
    if (!photoResult) return;
    try {
      const resp = await fetch(photoResult);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `cameleon-tryon-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(photoResult, '_blank');
    }
  }, [photoResult]);

  const downloadRecording = useCallback(() => {
    if (!recordedVideoUrl) return;
    const ext = recordMimeRef.current.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = recordedVideoUrl;
    a.download = `cameleon-live-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [recordedVideoUrl]);

  const closeRecordingModal = useCallback(() => {
    setShowRecordingModal(false);
  }, []);

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden gradient-bg">

      {/* ═══════════ HEADER ═══════════ */}
      <header className="flex items-center justify-between px-6 md:px-10 lg:px-14 xl:px-20 pt-5 md:pt-6 pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="" className="w-8 h-8 md:w-9 md:h-9 rounded-md object-contain" />
          <span className="font-display text-brand-dark text-lg md:text-xl font-medium leading-none tracking-tight">
            Cameleon
          </span>
        </div>
        <div className="bg-brand-peach rounded-full px-3 py-1.5 hidden sm:flex items-center gap-1.5 border border-[#f0ddd0]">
          <span className="text-brand-brown text-[10px] md:text-[11px] font-body font-medium opacity-80">
            Plug &amp; Play x
          </span>
          <img src={shopifyLogo} alt="Shopify" className="h-4 md:h-[18px] object-contain" />
        </div>
      </header>

      {/* ═══════════ TITLE BAR ═══════════ */}
      <div className="px-6 md:px-10 lg:px-14 xl:px-20 pt-1 pb-3 md:pb-4 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
        <h1 className="font-display text-brand-dark text-xl md:text-[28px] lg:text-[34px] font-medium tracking-tight leading-none italic">
          Camerino Virtuale
        </h1>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => { setMode('live'); if (isStreaming) stopStream(); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full bg-white font-body font-semibold text-brand-purple text-[11px] md:text-[12px] transition-all cursor-pointer hover:scale-105 ${
              mode === 'live' ? 'btn-active' : 'btn-styled opacity-60 hover:opacity-80'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            Live Mode
          </button>
          <button
            onClick={() => { setMode('photo'); if (isStreaming) stopStream(); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full bg-white font-body font-semibold text-brand-purple text-[11px] md:text-[12px] transition-all cursor-pointer hover:scale-105 ${
              mode === 'photo' ? 'btn-active' : 'btn-styled opacity-60 hover:opacity-80'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Photo Mode
          </button>
        </div>
      </div>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <div className="flex-1 min-h-0 px-6 md:px-10 lg:px-14 xl:px-20 pb-4 md:pb-6 flex flex-col lg:flex-row gap-3">

        {/* ─── Main panel ─── */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <div className="glass rounded-2xl flex-1 min-h-0 flex flex-col shadow-container p-2.5 md:p-3">

            <div className="flex-1 min-h-0 min-w-0">
              {mode === 'live' ? (
                <div className="bg-[#e0d9d2] rounded-xl h-full relative overflow-hidden">
                  <video ref={outputVideoRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-contain ${isStreaming ? '' : 'hidden'}`} />
                  <video ref={inputVideoRef} autoPlay muted playsInline
                    className={isStreaming
                      ? 'absolute bottom-2 right-2 md:bottom-3 md:right-3 w-24 h-18 md:w-32 md:h-24 rounded-lg border-2 border-white/60 shadow-xl z-10 object-cover'
                      : `absolute inset-0 w-full h-full object-contain ${cameraReady ? '' : 'hidden'}`
                    }
                  />
                  {isConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-20">
                      <div className="glass-strong rounded-lg px-4 py-2.5 flex flex-col items-center gap-1.5">
                        <Loader2 className="w-5 h-5 text-brand-purple animate-spin" />
                        <span className="text-brand-dark font-body font-medium text-[10px]">Connecting...</span>
                      </div>
                    </div>
                  )}
                  {!cameraReady && !isStreaming && !isConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-brand-dark/10 font-body text-xl md:text-2xl font-light tracking-tight">Webcam live</p>
                    </div>
                  )}
                  {isStreaming && (
                    <div className="absolute top-2 left-2 glass-strong rounded-md px-2 py-0.5 z-10 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 live-dot" />
                      <span className="text-[9px] font-body font-medium text-brand-dark/70">{hasGarment ? 'Image Mode' : 'Text Mode'}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-2 h-full min-h-0">
                  {/* Upload panel */}
                  <div className="flex-1 min-h-0 bg-[#e0d9d2] rounded-xl overflow-hidden flex flex-col">
                    <div
                      className="flex-1 min-h-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors m-2.5 rounded-lg upload-zone overflow-hidden"
                      onClick={() => photoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handlePhotoDrop}
                    >
                      {photoUpload ? (
                        <img src={photoUpload.url} alt="Uploaded" className="max-w-full max-h-full object-contain rounded-lg" />
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-brand-purple mb-1.5" />
                          <p className="font-sans text-[10px] text-brand-dark">Trascina file o <span className="text-brand-purple font-medium">Cerca</span></p>
                        </>
                      )}
                    </div>
                    <button className="mx-2.5 mb-2.5 btn-styled bg-white rounded-full py-1.5 font-body font-semibold text-brand-purple text-[10px] flex items-center justify-center gap-1 hover:scale-[1.02] transition-transform cursor-pointer shrink-0" onClick={() => photoInputRef.current?.click()}>
                      <ImagePlus className="w-3.5 h-3.5" />Upload Immagine
                    </button>
                  </div>
                  {/* Result panel */}
                  <div className="flex-1 min-h-0 bg-[#e0d9d2] rounded-xl overflow-hidden flex flex-col">
                    <div className="flex-1 min-h-0 flex items-center justify-center m-2.5 rounded-lg overflow-hidden">
                      {photoResult ? (
                        <img src={photoResult} alt="Generated" className="max-w-full max-h-full object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => { setComparePos(50); setShowCompare(true); }} title="Click to compare" />
                      ) : isGenerating ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <Loader2 className="w-5 h-5 text-brand-orange animate-spin" />
                          <p className="font-sans text-[10px] text-brand-dark/50">Generating...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-brand-dark/10">
                          <Sparkles className="w-5 h-5" />
                          <p className="font-sans text-[10px] text-center">Generated image appears here</p>
                        </div>
                      )}
                    </div>
                    <button onClick={handleGenerate} disabled={!photoUpload || !hasGarment || isGenerating}
                      className={`mx-2.5 mb-2.5 bg-[rgba(234,177,131,0.17)] btn-styled rounded-full py-1.5 font-body font-semibold text-brand-orange text-[10px] flex items-center justify-center gap-1 hover:scale-[1.02] transition-transform shrink-0 ${!photoUpload || !hasGarment || isGenerating ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setPhotoUpload({ url: URL.createObjectURL(file), file }); setPhotoResult(null); } }} />
                </div>
              )}
            </div>

            {/* Prompt bar (Live Mode only) */}
            {mode === 'live' && (
              <div className="mt-2 shrink-0">
                <div className="bg-white/50 rounded-lg p-1.5 flex items-center gap-1.5">
                  <div className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-body font-medium shrink-0 ${hasGarment ? 'bg-brand-purple/10 text-brand-purple' : 'bg-brand-orange/10 text-brand-orange'}`}>
                    {hasGarment ? 'Image Mode' : 'Text Mode'}
                  </div>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !isStreaming && !isConnecting) startStream(); }}
                    placeholder="Describe the look you want to try..."
                    className="flex-1 min-w-0 bg-white/70 rounded-md px-2.5 py-1 font-body text-[11px] text-brand-dark placeholder:text-brand-dark/25 outline-none focus:bg-white transition-colors"
                  />
                  {!isStreaming && !isConnecting && (
                    <button onClick={startStream} className="bg-gradient-to-br from-brand-purple to-[#7c3aed] text-white rounded-md px-3 py-1 font-body font-semibold text-[11px] flex items-center gap-1 hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-md shadow-brand-purple/25 shrink-0 cursor-pointer">
                      <Play className="w-3 h-3 fill-current" /><span className="hidden sm:inline">Start</span>
                    </button>
                  )}
                  {isConnecting && (
                    <button disabled className="bg-brand-purple/50 text-white rounded-md px-3 py-1 font-body font-semibold text-[11px] flex items-center gap-1 shrink-0 cursor-wait">
                      <Loader2 className="w-3 h-3 animate-spin" /><span className="hidden sm:inline">Wait</span>
                    </button>
                  )}
                  {isStreaming && !isConnecting && (
                    <button onClick={stopStream} className="bg-red-500 text-white rounded-md px-3 py-1 font-body font-semibold text-[11px] flex items-center gap-1 hover:bg-red-600 active:scale-[0.98] transition-all shrink-0 cursor-pointer">
                      <Square className="w-2.5 h-2.5 fill-current" /><span className="hidden sm:inline">Stop</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ─── Right: Garment Sidebar ─── */}
        <div className="lg:w-[170px] xl:w-[185px] shrink-0 flex-1 lg:flex-none min-h-0 max-h-[130px] lg:max-h-none">
          <div className="glass rounded-2xl p-2 h-full flex flex-col shadow-container">
            {/* Upload zone — desktop */}
            <div
              className="hidden lg:flex upload-zone rounded-lg p-2.5 flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-purple-50/30 transition-colors shrink-0 min-h-[70px]"
              onClick={() => garmentInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleGarmentDrop}
            >
              {customGarment ? (
                <img src={customGarment.url} alt="Custom garment" className="max-h-[50px] object-contain rounded-md" />
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-brand-purple" />
                  <p className="font-sans text-[9px] text-brand-dark text-center leading-tight">Trascina file o <span className="text-brand-purple font-medium">Cerca</span></p>
                </>
              )}
            </div>
            <button className="hidden lg:flex w-full mt-1 btn-styled bg-white rounded-full py-1 font-body font-semibold text-brand-purple text-[10px] items-center justify-center gap-1 hover:scale-[1.02] transition-transform shrink-0 cursor-pointer" onClick={() => garmentInputRef.current?.click()}>
              <ImagePlus className="w-3 h-3" />Upload Immagine
            </button>
            {/* Garment list */}
            <div className="lg:mt-1.5 flex-1 min-h-0 overflow-hidden">
              <div className="flex lg:flex-col gap-1.5 h-full lg:overflow-y-auto overflow-x-auto styled-scrollbar pb-0.5 lg:pb-0">
                {/* Mobile upload card */}
                <button className="lg:hidden garment-card rounded-lg p-1.5 shrink-0 w-[75px] aspect-square flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:scale-[1.03] transition-transform" onClick={() => garmentInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={handleGarmentDrop}>
                  {customGarment ? (
                    <img src={customGarment.url} alt="Custom" className="w-full h-full object-cover rounded-md" />
                  ) : (
                    <><Upload className="w-3.5 h-3.5 text-brand-purple" /><span className="text-[8px] font-body text-brand-purple font-semibold">Upload</span></>
                  )}
                </button>
                {GARMENTS.map((garment) => (
                  <button
                    key={garment.id}
                    onClick={() => { setSelectedGarment((prev) => prev === garment.id ? null : garment.id); setCustomGarment(null); }}
                    className={`garment-card rounded-lg p-1 lg:p-1.5 shrink-0 w-[75px] lg:w-full aspect-square flex items-center justify-center transition-all cursor-pointer ${selectedGarment === garment.id ? 'selected scale-[1.02]' : 'hover:scale-[1.03]'}`}
                  >
                    <img src={garment.image} alt={garment.name} className="w-full h-full object-cover rounded-md" />
                  </button>
                ))}
              </div>
            </div>
            <input ref={garmentInputRef} type="file" accept="image/*" className="hidden" onChange={handleGarmentUpload} />
          </div>
        </div>
      </div>

      {/* ═══════════ A/B COMPARE OVERLAY ═══════════ */}
      {showCompare && photoResult && photoUpload && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center select-none">
          <div className="flex items-center justify-between w-full max-w-5xl px-4 md:px-6 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="bg-white/10 text-white/80 px-2.5 py-0.5 rounded-full text-[10px] font-body">Original</span>
              <span className="text-white/30 text-[10px]">drag</span>
              <span className="bg-white/10 text-white/80 px-2.5 py-0.5 rounded-full text-[10px] font-body">Generated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={downloadResult} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white rounded-md px-2.5 py-1 text-[10px] font-body font-medium transition-colors cursor-pointer">
                <Download className="w-3 h-3" />Download
              </button>
              <button onClick={() => setShowCompare(false)} className="flex items-center justify-center w-7 h-7 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div
            ref={compareContainerRef}
            className="relative w-full max-w-5xl flex-1 min-h-0 mx-4 md:mx-6 mb-4 rounded-xl overflow-hidden cursor-ew-resize"
            onMouseDown={(e) => { isCompareDragging.current = true; updateComparePos(e.clientX); }}
            onTouchStart={(e) => { isCompareDragging.current = true; updateComparePos(e.touches[0].clientX); }}
          >
            <img src={photoUpload.url} alt="Original" className="absolute inset-0 w-full h-full object-contain pointer-events-none" draggable={false} />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${comparePos}%)` }}>
              <img src={photoResult} alt="Generated" className="absolute inset-0 w-full h-full object-contain pointer-events-none" draggable={false} />
            </div>
            <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${comparePos}%` }}>
              <div className="absolute -translate-x-1/2 w-[2px] h-full bg-white/70" />
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center pointer-events-auto cursor-ew-resize">
                <MoveHorizontal className="w-3.5 h-3.5 text-brand-dark" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-body pointer-events-none">Original</div>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-body pointer-events-none">Generated</div>
          </div>
        </div>
      )}

      {/* ═══════════ RECORDING MODAL ═══════════ */}
      {showRecordingModal && recordedVideoUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center select-none p-4 md:p-8">
          <div className="glass-strong rounded-2xl max-w-lg w-full flex flex-col overflow-hidden shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-brand-purple" />
                <span className="font-body font-semibold text-brand-dark text-sm">Session Recording</span>
              </div>
              <button onClick={closeRecordingModal} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/10 transition-colors cursor-pointer">
                <X className="w-4 h-4 text-brand-dark" />
              </button>
            </div>

            {/* Video preview */}
            <div className="p-4">
              <div className="rounded-xl overflow-hidden bg-black">
                <video src={recordedVideoUrl} controls autoPlay loop className="w-full max-h-[60vh] object-contain" />
              </div>
              <p className="text-[10px] text-brand-dark/40 font-body mt-2 text-center">Top: Virtual try-on &middot; Bottom: Original webcam</p>
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={closeRecordingModal} className="flex-1 py-2 rounded-full border border-brand-dark/15 text-brand-dark font-body font-semibold text-xs hover:bg-black/5 transition-colors cursor-pointer">
                Close
              </button>
              <button onClick={downloadRecording} className="flex-1 py-2 rounded-full bg-gradient-to-br from-brand-purple to-[#7c3aed] text-white font-body font-semibold text-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-md shadow-brand-purple/25 cursor-pointer">
                <Download className="w-3.5 h-3.5" />Download Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
