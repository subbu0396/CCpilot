"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WordCloud from "wordcloud";
import {
  wordSentimentHue,
  type ReviewWordEntry,
} from "@/lib/analysis/review-words";

type ReviewWordCloudProps = {
  words: ReviewWordEntry[];
  selectedWord: string | null;
  onSelect: (word: string | null) => void;
  compact?: boolean;
};

export function ReviewWordCloud({
  words,
  selectedWord,
  onSelect,
  compact = false,
}: ReviewWordCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<ReviewWordEntry | null>(null);
  const [dimensions, setDimensions] = useState({ width: 280, height: 160 });

  const wordMap = useMemo(() => {
    const map = new Map<string, ReviewWordEntry>();
    for (const w of words) map.set(w.text.toLowerCase(), w);
    return map;
  }, [words]);

  const selected = words.find((w) => w.text === selectedWord) ?? null;

  const resize = useCallback(() => {
    if (!containerRef.current) return;
    const { width } = containerRef.current.getBoundingClientRect();
    setDimensions({
      width: Math.max(200, width - 8),
      height: compact ? 150 : 200,
    });
  }, [compact]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || words.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    const maxCount = Math.max(...words.map((w) => w.value), 1);
    const list: [string, number][] = words.map((w) => [
      w.text,
      Math.round(10 + (w.value / maxCount) * (compact ? 28 : 36)),
    ]);

    WordCloud(canvas, {
      list,
      gridSize: compact ? 6 : 8,
      weightFactor: 1,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "600",
      color: (word) => {
        const w = String(word).toLowerCase();
        if (w === selectedWord) return "hsl(221, 83%, 38%)";
        return wordSentimentHue(w);
      },
      rotateRatio: 0.25,
      rotationSteps: 2,
      backgroundColor: "transparent",
      drawOutOfBound: false,
      shrinkToFit: true,
      click: (item) => {
        const text = item[0] as string;
        onSelect(selectedWord === text ? null : text);
      },
      hover: (item) => {
        if (!item) {
          setHovered(null);
          return;
        }
        setHovered(wordMap.get(String(item[0]).toLowerCase()) ?? null);
      },
    });
  }, [words, dimensions, wordMap, onSelect, selectedWord, compact]);

  if (words.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Upload reviews to see common words.
      </p>
    );
  }

  const tooltip = hovered && !selected;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border bg-gradient-to-br from-slate-50/80 to-blue-50/50"
      >
        <canvas
          ref={canvasRef}
          className="mx-auto cursor-pointer"
          aria-label="Review word cloud"
        />

        {tooltip && (
          <div className="pointer-events-none absolute bottom-1 left-1 right-1 rounded bg-white/95 px-2 py-1 text-[10px] shadow-sm backdrop-blur">
            <span className="font-semibold">{hovered.text}</span>
            <span className="text-muted-foreground"> · {hovered.value} reviews</span>
          </div>
        )}

        {!tooltip && !selected && (
          <p className="pointer-events-none absolute right-2 top-1 text-[9px] text-muted-foreground">
            Click to explore
          </p>
        )}
      </div>

      {selected && selected.quotes[0] && (
        <blockquote className="line-clamp-2 rounded border-l-2 border-primary/50 bg-muted/40 px-2 py-1 text-[10px] italic text-muted-foreground">
          &ldquo;{selected.quotes[0].text.slice(0, 120)}…&rdquo;
          <span className="not-italic"> · {selected.quotes[0].source}</span>
        </blockquote>
      )}
    </div>
  );
}
