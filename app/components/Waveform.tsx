"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
    stream: MediaStream | null;
    isPaused?: boolean;
    className?: string;
    lineColor?: string;
}

type AudioContextCtor = typeof AudioContext;
type ExtendedWindow = Window & { webkitAudioContext?: AudioContextCtor };

export default function Waveform({ stream, isPaused = false, className = "", lineColor = "#606060" }: WaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);

    function startVisualizer() {
        if (!stream) return;

        const AudioContextImpl = window.AudioContext || (window as ExtendedWindow).webkitAudioContext;
        if (!AudioContextImpl) return;
        const audioCtx = new AudioContextImpl();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        source.connect(analyser);

        analyserRef.current = analyser;
        audioCtxRef.current = audioCtx;
        dataRef.current = new Uint8Array<ArrayBuffer>(new ArrayBuffer(analyser.frequencyBinCount));

        draw();
    }

    function stopVisualizer() {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (audioCtxRef.current) audioCtxRef.current.close();

        audioCtxRef.current = null;
        analyserRef.current = null;
        animationRef.current = null;

        // Clear canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    function draw() {
        const canvas = canvasRef.current;
        if (!canvas || !analyserRef.current || !dataRef.current) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const analyser = analyserRef.current;
        const dataArray = dataRef.current;
        const width = canvas.width;
        const height = canvas.height;

        const renderFrame = () => {
            animationRef.current = requestAnimationFrame(renderFrame);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, width, height);

            // Professional "Bar" style waveform
            const barWidth = (width / dataArray.length) * 2.5;
            let x = 0;

            for (let i = 0; i < dataArray.length; i++) {
                const barHeight = (dataArray[i] / 255) * height;

                // Center the bars vertically
                const y = (height - barHeight) / 2;

                ctx.fillStyle = lineColor;
                ctx.beginPath();
                // Rounded bar effect
                ctx.roundRect(x, y, barWidth - 1, barHeight, 2);
                ctx.fill();

                x += barWidth;
                if (x > width) break;
            }
        };

        renderFrame();
    }

    useEffect(() => {
        if (!stream || isPaused) {
            stopVisualizer();
            return;
        }

        startVisualizer();

        return () => stopVisualizer();
    }, [stream, isPaused]);

    return (
        <canvas
            ref={canvasRef}
            width={120}
            height={24}
            className={`opacity-60 transition-opacity duration-300 ${className}`}
        />
    );
}
