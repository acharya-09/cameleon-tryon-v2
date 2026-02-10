import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  Camera,
  Upload,
  Play,
  Square,
  Shirt,
  Sparkles,
  ImagePlus,
  Loader2,
  ShoppingBag,
  X,
  Download,
  MoveHorizontal,
} from 'lucide-react';

// Assets
import logoIcon from './assets/6233dd42c6e5f4d78a75023b52c3d4d714d37ad2.png';
import jacket1 from './assets/bddfcd46dbf62dc5c5cd88c84ada367e2fd843b0.png';
import jacket2 from './assets/fdf2a845d078f4104ac8213fc61e021f3917da5c.png';

// ─── Pre-defined garments ───────────────────────────────────
const GARMENTS: { id: number; image: string | null; name: string }[] = [
  { id: 0, image: jacket1, name: 'Floral Jacket' },
  { id: 1, image: jacket2, name: 'Puffer Jacket' },
  { id: 2, image: null, name: 'Coming Soon' },
  { id: 3, image: null, name: 'Coming Soon' },
  { id: 4, image: null, name: 'Coming Soon' },
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
    customGarment !== null ||
    (selectedGarment !== null && GARMENTS[selectedGarment]?.image !== null);

  const getGarmentFile = useCallback(async (): Promise<File | null> => {
    if (customGarment) return customGarment.file;
    if (selectedGarment !== null && GARMENTS[selectedGarment]?.image) {
      const resp = await fetch(GARMENTS[selectedGarment].image!);
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
  const stopStream = useCallback(() => {
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
  }, []);

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

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden gradient-bg">

      {/* ═══════════ HEADER ═══════════ */}
      <header className="flex items-center justify-between px-4 md:px-6 lg:px-8 pt-3 md:pt-4 pb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src={logoIcon}
            alt=""
            className="w-9 h-9 md:w-11 md:h-11 rounded-lg object-contain opacity-90"
          />
          <span className="font-display text-brand-dark text-lg md:text-[24px] font-medium leading-none">
            Cameleon
          </span>
        </div>
        <div className="bg-brand-peach rounded-full px-3.5 md:px-4 py-1.5 md:py-2 hidden sm:flex items-center gap-1.5 border border-[#f0ddd0]">
          <span className="text-brand-brown text-[11px] md:text-[13px] font-medium opacity-80">
            Plug &amp; Play x
          </span>
          <div className="flex items-center gap-0.5">
            <ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#95BF47]" strokeWidth={2.5} />
            <span className="text-brand-brown text-[12px] md:text-[14px] font-bold tracking-tight">
              shopify
            </span>
          </div>
        </div>
      </header>

      {/* ═══════════ TITLE BAR ═══════════ */}
      <div className="px-4 md:px-6 lg:px-8 pb-2 shrink-0">
        <div className="glass-strong rounded-2xl px-4 md:px-5 py-2 md:py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 shadow-container">
          <h1 className="font-display text-brand-dark text-lg md:text-2xl lg:text-[32px] font-medium tracking-tight leading-tight">
            Camerino Virtuale
          </h1>
          <div className="flex gap-2 md:gap-2.5 shrink-0">
            <button
              onClick={() => {
                setMode('live');
                if (isStreaming) stopStream();
              }}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-[13px] bg-white font-body font-semibold text-brand-purple text-[11px] md:text-[13px] transition-all cursor-pointer hover:scale-105 ${
                mode === 'live'
                  ? 'btn-active'
                  : 'btn-styled opacity-60 hover:opacity-80'
              }`}
            >
              <Video className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Live Mode
            </button>
            <button
              onClick={() => {
                setMode('photo');
                if (isStreaming) stopStream();
              }}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-[13px] bg-white font-body font-semibold text-brand-purple text-[11px] md:text-[13px] transition-all cursor-pointer hover:scale-105 ${
                mode === 'photo'
                  ? 'btn-active'
                  : 'btn-styled opacity-60 hover:opacity-80'
              }`}
            >
              <Camera className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Photo Mode
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <div className="flex-1 min-h-0 px-4 md:px-6 lg:px-8 flex flex-col lg:flex-row gap-2.5 md:gap-3">
        {/* ─── Video / Content Panel ─── */}
        <div className="flex-[3] lg:flex-1 min-h-0 min-w-0">
      {mode === 'live' ? (
            <div className="glass rounded-3xl h-full relative overflow-hidden shadow-container">
              {/* Output video (Lucy stream - shown when streaming) */}
              <video
                ref={outputVideoRef}
                autoPlay
                playsInline
                className={`absolute inset-0 w-full h-full object-contain ${
                  isStreaming ? '' : 'hidden'
                }`}
              />

              {/* Input video: full size when idle, PiP when streaming */}
              <video
                ref={inputVideoRef}
                autoPlay
                muted
                playsInline
                className={
                  isStreaming
                    ? 'absolute bottom-3 right-3 md:bottom-4 md:right-4 w-28 h-20 md:w-44 md:h-32 rounded-2xl border-2 border-white/60 shadow-xl z-10 object-cover'
                    : `absolute inset-0 w-full h-full object-contain ${
                        cameraReady ? '' : 'hidden'
                      }`
                }
              />

              {/* Connecting overlay */}
              {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-20">
                  <div className="glass-strong rounded-2xl px-6 py-4 flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
                    <span className="text-brand-dark font-body font-medium text-sm">
                      Connecting...
                    </span>
                  </div>
                </div>
              )}

              {/* Placeholder when no camera */}
              {!cameraReady && !isStreaming && !isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-brand-dark/20 font-body text-xl md:text-2xl font-medium tracking-tight">
                    Webcam live
                  </p>
                </div>
              )}

              {/* Streaming indicator badge */}
              {isStreaming && (
                <div className="absolute top-3 left-3 md:top-4 md:left-4 glass-strong rounded-xl px-3 py-1.5 z-10 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 live-dot" />
                  <span className="text-xs font-body font-medium text-brand-dark/70">
                    {hasGarment ? 'Image Mode' : 'Text Mode'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* ─── Photo Mode ─── */
            <div className="flex flex-col md:flex-row gap-2.5 md:gap-3 h-full min-h-0">
              {/* Upload panel — model photo */}
              <div className="flex-1 min-h-0 glass rounded-2xl overflow-hidden shadow-container flex flex-col">
                <div
                  className="flex-1 min-h-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors m-3 md:m-4 rounded-xl upload-zone overflow-hidden"
                  onClick={() => photoInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handlePhotoDrop}
                >
                  {photoUpload ? (
                    <img
                      src={photoUpload.url}
                      alt="Uploaded"
                      className="max-w-full max-h-full object-contain rounded-xl"
                    />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-brand-purple mb-2" />
                      <p className="font-sans text-xs text-brand-dark">
                        Trascina file o{' '}
                        <span className="text-brand-purple font-medium">
                          Cerca
                        </span>
                      </p>
                    </>
                  )}
                </div>
                <button
                  className="mx-3 md:mx-4 mb-3 md:mb-4 btn-styled bg-white rounded-[15px] py-2 font-body font-semibold text-brand-purple text-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] transition-transform cursor-pointer shrink-0"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <ImagePlus className="w-4 h-4" />
                  Upload Immagine
                </button>
              </div>

              {/* Output panel — generated result only */}
              <div className="flex-1 min-h-0 glass rounded-2xl overflow-hidden shadow-container flex flex-col">
                <div className="flex-1 min-h-0 flex items-center justify-center m-3 md:m-4 rounded-xl overflow-hidden">
                  {photoResult ? (
                    <img
                      src={photoResult}
                      alt="Generated result"
                      className="max-w-full max-h-full object-contain rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => {
                        setComparePos(50);
                        setShowCompare(true);
                      }}
                      title="Click to compare"
                    />
                  ) : isGenerating ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-brand-orange animate-spin" />
                      <p className="font-sans text-xs text-brand-dark/50">
                        Generating...
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-brand-dark/20">
                      <Sparkles className="w-8 h-8" />
                      <p className="font-sans text-xs text-center">
                        Generated image will appear here
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!photoUpload || !hasGarment || isGenerating}
                  className={`mx-3 md:mx-4 mb-3 md:mb-4 bg-[rgba(234,177,131,0.17)] btn-styled rounded-[15px] py-2 font-body font-semibold text-brand-orange text-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] transition-transform shrink-0 ${
                    !photoUpload || !hasGarment || isGenerating
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPhotoUpload({ url: URL.createObjectURL(file), file });
                    setPhotoResult(null);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* ─── Garment Sidebar ─── */}
        <div className="lg:w-[240px] shrink-0 flex-1 lg:flex-none min-h-0 max-h-[170px] lg:max-h-none">
          <div className="glass rounded-2xl p-2.5 md:p-3 h-full flex flex-col shadow-container">
            {/* Upload zone — desktop */}
            <div
              className="hidden lg:flex upload-zone rounded-xl p-4 flex-col items-center justify-center gap-1 cursor-pointer hover:bg-purple-50/30 transition-colors shrink-0 min-h-[100px]"
              onClick={() => garmentInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleGarmentDrop}
            >
              {customGarment ? (
                <img
                  src={customGarment.url}
                  alt="Custom garment"
                  className="max-h-[80px] object-contain rounded-xl"
                />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-brand-purple" />
                  <p className="font-sans text-xs text-brand-dark text-center">
                    Trascina file o{' '}
                    <span className="text-brand-purple font-medium">Cerca</span>
                  </p>
                </>
              )}
            </div>

            {/* Upload button — desktop */}
            <button
              className="hidden lg:flex w-full mt-2 btn-styled bg-white rounded-[15px] py-2 font-body font-semibold text-brand-purple text-xs items-center justify-center gap-1.5 hover:scale-[1.02] transition-transform shrink-0 cursor-pointer"
              onClick={() => garmentInputRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4" />
              Upload Immagine
            </button>

            {/* Garment list */}
            <div className="lg:mt-2 flex-1 min-h-0 overflow-hidden">
              <div className="flex lg:flex-col gap-2 lg:gap-2 h-full lg:overflow-y-auto overflow-x-auto styled-scrollbar lg:pr-1 pb-1 lg:pb-0">
                {/* Mobile-only upload card */}
                <button
                  className="lg:hidden garment-card rounded-2xl p-2.5 shrink-0 w-[100px] aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer hover:scale-[1.03] transition-transform"
                  onClick={() => garmentInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleGarmentDrop}
                >
                  {customGarment ? (
                    <img
                      src={customGarment.url}
                      alt="Custom"
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-brand-purple" />
                      <span className="text-[10px] font-body text-brand-purple font-semibold">
                        Upload
                      </span>
                    </>
                  )}
                </button>

                {/* Garment cards */}
                {GARMENTS.map((garment) => (
                  <button
                    key={garment.id}
                    onClick={() => {
                      if (!garment.image) return;
                      setSelectedGarment((prev) =>
                        prev === garment.id ? null : garment.id
                      );
                      setCustomGarment(null);
                    }}
                    disabled={!garment.image}
                    className={`garment-card rounded-2xl lg:rounded-2xl p-2 lg:p-3 shrink-0 w-[100px] lg:w-full aspect-square flex items-center justify-center transition-all ${
                      selectedGarment === garment.id
                        ? 'selected scale-[1.02]'
                        : 'hover:scale-[1.03]'
                    } ${
                      garment.image
                        ? 'cursor-pointer'
                        : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {garment.image ? (
                      <img
                        src={garment.image}
                        alt={garment.name}
                        className="w-full h-full object-cover rounded-xl"
        />
      ) : (
                      <div className="flex flex-col items-center gap-1 text-brand-dark/30">
                        <Shirt className="w-6 h-6 lg:w-8 lg:h-8" />
                        <span className="text-[10px] lg:text-xs font-body">
                          Coming Soon
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGarmentUpload}
            />
          </div>
        </div>
      </div>

      {/* ═══════════ A/B COMPARE OVERLAY ═══════════ */}
      {showCompare && photoResult && photoUpload && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center select-none">
          {/* Top bar */}
          <div className="flex items-center justify-between w-full max-w-5xl px-4 md:px-6 py-3 shrink-0">
            <div className="flex items-center gap-3">
              <span className="bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs font-body">
                Original
              </span>
              <span className="text-white/30 text-xs">←  drag  →</span>
              <span className="bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs font-body">
                Generated
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadResult}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1.5 text-xs font-body font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
              <button
                onClick={() => setShowCompare(false)}
                className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Compare container */}
          <div
            ref={compareContainerRef}
            className="relative w-full max-w-5xl flex-1 min-h-0 mx-4 md:mx-6 mb-4 rounded-2xl overflow-hidden cursor-ew-resize"
            onMouseDown={(e) => {
              isCompareDragging.current = true;
              updateComparePos(e.clientX);
            }}
            onTouchStart={(e) => {
              isCompareDragging.current = true;
              updateComparePos(e.touches[0].clientX);
            }}
          >
            {/* Original (full, below) */}
            <img
              src={photoUpload.url}
              alt="Original"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />

            {/* Generated (clipped from left at slider position) */}
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 0 0 ${comparePos}%)` }}
            >
              <img
                src={photoResult}
                alt="Generated"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            </div>

            {/* Slider line + handle */}
            <div
              className="absolute top-0 bottom-0 z-10 pointer-events-none"
              style={{ left: `${comparePos}%` }}
            >
              <div className="absolute -translate-x-1/2 w-[2px] h-full bg-white/70" />
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center pointer-events-auto cursor-ew-resize">
                <MoveHorizontal className="w-4 h-4 text-brand-dark" />
              </div>
            </div>

            {/* Labels */}
            <div className="absolute bottom-3 left-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-[10px] font-body pointer-events-none">
              Original
            </div>
            <div className="absolute bottom-3 right-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-[10px] font-body pointer-events-none">
              Generated
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PROMPT BAR (Live Mode) ═══════════ */}
      {mode === 'live' && (
        <div className="px-4 md:px-6 lg:px-8 py-2 md:py-2.5 shrink-0">
          <div className="glass-strong rounded-xl p-2 md:p-2.5 flex items-center gap-2 md:gap-2.5 shadow-container">
            {/* Mode pill indicator */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-body font-medium shrink-0 ${
                hasGarment
                  ? 'bg-brand-purple/10 text-brand-purple'
                  : 'bg-brand-orange/10 text-brand-orange'
              }`}
            >
              {hasGarment ? 'Image Mode' : 'Text Mode'}
            </div>

            {/* Prompt input */}
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isStreaming && !isConnecting)
                  startStream();
              }}
              placeholder="Describe the look you want to try..."
              className="flex-1 min-w-0 bg-white/50 rounded-lg px-3 md:px-3.5 py-1.5 md:py-2 font-body text-xs md:text-sm text-brand-dark placeholder:text-brand-dark/30 outline-none focus:bg-white/80 transition-colors"
            />

            {/* Start button */}
            {!isStreaming && !isConnecting && (
              <button
                onClick={startStream}
                className="bg-gradient-to-br from-brand-purple to-[#7c3aed] text-white rounded-lg px-3.5 md:px-4 py-1.5 md:py-2 font-body font-semibold text-xs md:text-sm flex items-center gap-1.5 hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-lg shadow-brand-purple/25 shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Start</span>
              </button>
            )}

            {/* Connecting button */}
            {isConnecting && (
              <button
                disabled
                className="bg-brand-purple/50 text-white rounded-lg px-3.5 md:px-4 py-1.5 md:py-2 font-body font-semibold text-xs md:text-sm flex items-center gap-1.5 shrink-0 cursor-wait"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Wait</span>
              </button>
            )}

            {/* Stop button */}
            {isStreaming && !isConnecting && (
              <button
                onClick={stopStream}
                className="bg-red-500 text-white rounded-lg px-3.5 md:px-4 py-1.5 md:py-2 font-body font-semibold text-xs md:text-sm flex items-center gap-1.5 hover:bg-red-600 active:scale-[0.98] transition-all shrink-0 cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
