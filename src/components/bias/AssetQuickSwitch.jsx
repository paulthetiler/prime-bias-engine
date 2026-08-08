import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GripHorizontal } from 'lucide-react';
import {
  orderAnalyses,
  saveInstrumentOrder,
  hasSeenReorderHint,
  markReorderHintSeen,
} from '@/lib/instrumentOrder';

// How long the pill must be held still before it "lifts" into reorder mode.
// Long enough not to fire during a horizontal scroll flick, short enough to
// feel responsive — the same ballpark as rearranging apps on a phone.
const LONG_PRESS_MS = 300;
// If the finger travels further than this before the hold completes, the user
// is scrolling the row, not reordering.
const MOVE_THRESHOLD_PX = 8;

function triggerHaptic() {
  // Best-effort — silently a no-op where the device/browser doesn't support it
  // (e.g. iOS Safari), which is exactly the "where supported" the spec calls for.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  } catch {
    /* haptics unsupported — ignore */
  }
}

const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// One draggable favourite pill.
//
// The pill owns the horizontal axis (its container is `touch-action: pan-y`, so
// the browser only ever handles vertical page scroll and never cancels the
// pointer mid-gesture). That lets one continuous gesture do three things,
// disambiguated the way a phone home-screen does:
//   • tap                     → select the instrument
//   • horizontal swipe        → scroll the row (we drive scrollLeft ourselves)
//   • press-and-hold, then drag → reorder (framer drag via dragControls)
function ReorderablePill({ analysis, isActive, reordering, onSelect, onReorderStart, scrollRef, interactionRef }) {
  const controls = useDragControls();
  const longPressTimer = useRef(null);
  const gesture = useRef(null); // { x, y, scrollLeft } | null
  const enteredReorder = useRef(false);
  const scrolling = useRef(false);
  const cleanupRef = useRef(null); // detaches the window listeners for this gesture

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const endGesture = useCallback(() => {
    clearLongPress();
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    gesture.current = null;
    scrolling.current = false;
  }, [clearLongPress]);

  useEffect(() => endGesture, [endGesture]);

  const handlePointerDown = (e) => {
    // Ignore secondary mouse buttons; touch/pen/left-click only.
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const startEvent = e.nativeEvent;
    gesture.current = { x: e.clientX, y: e.clientY, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    enteredReorder.current = false;
    scrolling.current = false;

    // Track the whole gesture on window so moves keep coming even as the finger
    // slides off this pill — and so framer (which also listens on window) and
    // our scroll handling never fight over pointer capture.
    const onMove = (ev) => {
      if (enteredReorder.current || !gesture.current) return; // framer drives the drag
      const dx = ev.clientX - gesture.current.x;
      const dy = ev.clientY - gesture.current.y;

      if (!scrolling.current) {
        if (Math.abs(dx) > MOVE_THRESHOLD_PX && Math.abs(dx) >= Math.abs(dy)) {
          scrolling.current = true; // predominantly horizontal → a row scroll
          clearLongPress();
        } else if (Math.abs(dy) > MOVE_THRESHOLD_PX) {
          endGesture(); // vertical intent → let the page scroll; abandon this gesture
          return;
        }
      }
      if (scrolling.current && scrollRef.current) {
        scrollRef.current.scrollLeft = gesture.current.scrollLeft - dx;
      }
    };
    const onUp = () => {
      if (scrolling.current) {
        // A completed scroll must not also register as a tap-to-select.
        interactionRef.current.suppressClickUntil = performance.now() + 150;
      }
      endGesture();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      enteredReorder.current = true;
      onReorderStart();
      // Hand the in-progress press to framer to begin the drag from here.
      controls.start(startEvent);
    }, LONG_PRESS_MS);
  };

  const handleClick = (e) => {
    // Swallow the click that trails a drag, a scroll or a long-press activation
    // so it never gets mistaken for a tap-to-select.
    if (
      reordering ||
      enteredReorder.current ||
      scrolling.current ||
      (interactionRef.current && performance.now() < interactionRef.current.suppressClickUntil)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect();
  };

  const { instrument } = analysis;

  return (
    <Reorder.Item
      as="div"
      value={instrument}
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.06,
        zIndex: 50,
        boxShadow: '0 12px 24px -8px rgba(0,0,0,0.45)',
        cursor: 'grabbing',
      }}
      className="shrink-0"
      style={{ touchAction: 'pan-y' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        data-active={isActive}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        // The finger lands on this button, so IT must own the horizontal axis
        // (pan-y = browser handles vertical page scroll only). Without this the
        // button's default `auto` lets the browser claim horizontal drags and
        // fire pointercancel, killing both the reorder and our manual scroll.
        style={{ touchAction: 'pan-y' }}
        className={cn(
          'relative flex items-center gap-1.5 px-3 py-1.5 rounded-[13px] border transition-colors whitespace-nowrap select-none w-full',
          isActive
            ? 'border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_-6px_rgba(20,184,166,0.35)]'
            : 'bg-card border-border/70 shadow-sm hover:border-primary/40',
          reordering && 'cursor-grab'
        )}
      >
        <span className="text-sm font-semibold">{instrument}</span>

        {/* Grip affordance while reordering — reinforces "these can be moved" */}
        {reordering && (
          <GripHorizontal className={cn('w-3.5 h-3.5', isActive ? 'text-white/70' : 'text-muted-foreground/60')} />
        )}
      </button>
    </Reorder.Item>
  );
}

export default function AssetQuickSwitch({ analyses, currentInstrument, onInstrumentChange }) {
  const scrollContainerRef = useRef(null);

  // Local, reorderable list of instrument symbols. Seeded from the saved order
  // so a custom arrangement survives reloads; framer drives it live during a drag.
  const [order, setOrder] = useState(() => orderAnalyses(analyses).map((a) => a.instrument));
  const [reordering, setReordering] = useState(false);
  const [hintSeen, setHintSeen] = useState(hasSeenReorderHint);

  const orderRef = useRef(order);
  const hintSeenRef = useRef(hintSeen);
  const dragStartOrderRef = useRef(null);
  // Shared window during which a trailing click must be ignored (post-drag/scroll).
  const interactionRef = useRef({ suppressClickUntil: 0 });

  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { hintSeenRef.current = hintSeen; }, [hintSeen]);

  // Reconcile the local order whenever the set of active instruments changes
  // (an asset added, removed or completed) without disturbing the user's
  // arrangement: keep known instruments in place, drop gone ones, append new.
  const instrumentKey = analyses.map((a) => a.instrument).join('');
  useEffect(() => {
    const incoming = analyses.map((a) => a.instrument);
    setOrder((prev) => {
      const kept = prev.filter((inst) => incoming.includes(inst));
      const added = incoming.filter((inst) => !kept.includes(inst));
      const next = [...kept, ...added];
      return sameOrder(next, prev) ? prev : next;
    });

  }, [instrumentKey]);

  // Auto-scroll to the active pill when it changes (unless mid-reorder).
  useEffect(() => {
    if (reordering) return;
    const activeTab = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentInstrument, reordering]);

  const handleReorder = useCallback((next) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const onReorderStart = useCallback(() => {
    dragStartOrderRef.current = orderRef.current;
    triggerHaptic();
    setReordering(true);
  }, []);

  // Finalise the gesture on release. Driven from a window-level pointerup so it
  // fires reliably even when the finger lifts off a different pill — and even
  // when the drop was a no-op (framer's onDragEnd doesn't fire without movement).
  const finalize = useCallback(() => {
    interactionRef.current.suppressClickUntil = performance.now() + 150;
    const start = dragStartOrderRef.current;
    const curr = orderRef.current;
    if (start && !sameOrder(start, curr)) {
      saveInstrumentOrder(curr);
      // Release = save. Once they've done it once, retire the hint for good.
      if (!hintSeenRef.current) {
        markReorderHintSeen();
        setHintSeen(true);
      }
    }
    dragStartOrderRef.current = null;
    setReordering(false);
  }, []);

  useEffect(() => {
    if (!reordering) return undefined;
    const onUp = () => finalize();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [reordering, finalize]);

  if (!analyses || analyses.length === 0) return null;

  const byInstrument = new Map(analyses.map((a) => [a.instrument, a]));
  const items = order.filter((inst) => byInstrument.has(inst));
  const showHint = !hintSeen && items.length >= 2;

  return (
    <div className="relative">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto scrollbar-hide"
        style={{ touchAction: 'pan-y' }}
      >
        <Reorder.Group
          as="div"
          axis="x"
          values={items}
          onReorder={handleReorder}
          className="flex gap-1.5 pt-0.5 pb-2 min-w-min"
        >
          {items.map((inst) => (
            <ReorderablePill
              key={inst}
              analysis={byInstrument.get(inst)}
              isActive={inst === currentInstrument}
              reordering={reordering}
              onSelect={() => onInstrumentChange(inst)}
              onReorderStart={onReorderStart}
              scrollRef={scrollContainerRef}
              interactionRef={interactionRef}
            />
          ))}
        </Reorder.Group>
      </div>

      {/* Subtle right-edge fade — hints there are more markets to scroll to.
          Suppressed while reordering so it doesn't clip the lifted pill. */}
      {!reordering && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent" />
      )}

      {/* One-time discovery hint, or the live "release to save" cue mid-drag. */}
      {reordering ? (
        <div className="flex items-center gap-1.5 px-1 -mt-1 text-[11px] text-primary font-medium">
          <GripHorizontal className="w-3 h-3" />
          <span>Drag to reorder — release to save</span>
        </div>
      ) : showHint ? (
        <div className="flex items-center gap-1.5 px-1 -mt-1 text-[11px] text-muted-foreground">
          <GripHorizontal className="w-3 h-3 opacity-70" />
          <span>Long press and drag to reorder favourites.</span>
        </div>
      ) : null}
    </div>
  );
}
