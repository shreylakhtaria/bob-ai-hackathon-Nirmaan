"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

function useMousePosition() {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  }));

  useEffect(() => {
    let raf: number | null = null;
    const handleMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setPos({ x: e.clientX, y: e.clientY });
        raf = null;
      });
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return pos;
}

function useBlink(minMs = 2400, maxMs = 5200) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let closeTimer: NodeJS.Timeout;
    let openTimer: NodeJS.Timeout;
    const schedule = () => {
      const delay = minMs + Math.random() * (maxMs - minMs);
      closeTimer = setTimeout(() => {
        setBlinking(true);
        openTimer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 130);
      }, delay);
    };
    schedule();
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
    };
  }, [minMs, maxMs]);

  return blinking;
}

function TrackingEye({ mouse, size = 26, maxTravel = 5 }: { mouse: { x: number; y: number }; size?: number; maxTravel?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.min(maxTravel, Math.hypot(dx, dy) / 14);
    const angle = Math.atan2(dy, dx);
    setOffset({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
  }, [mouse, maxTravel]);

  const pupil = Math.round(size * 0.42);

  return (
    <div ref={ref} className="gra-eye" style={{ width: size, height: size }}>
      <div
        className="gra-pupil"
        style={{
          width: pupil,
          height: pupil,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      />
    </div>
  );
}

function CharacterSlot({ children, eyeSize = 22 }: { children?: React.ReactNode; eyeSize?: number }) {
  const blinking = useBlink();
  return (
    <div className="gra-eye-slot" style={{ height: blinking ? 3 : eyeSize }}>
      {!blinking ? children : null}
    </div>
  );
}

function DotEye({ size = 11 }: { size?: number }) {
  const blinking = useBlink(3000, 6000);
  return (
    <div
      className="gra-dot-eye"
      style={{
        width: size,
        height: blinking ? 2 : size,
        opacity: blinking ? 0.4 : 0.78,
      }}
    />
  );
}

function MonitoringCrew({ mouse, mood }: { mouse: { x: number; y: number }; mood: "happy" | "worried" }) {
  return (
    <div className={`gra-crew ${mood === "worried" ? "gra-crew--worried" : ""}`}>
      <div className="gra-crew-group">
        <div className="gra-puppet gra-puppet--pink">
          <DotEye />
          <DotEye />
        </div>
        <div className="gra-puppet gra-puppet--blue">
          <CharacterSlot eyeSize={26}>
            <TrackingEye mouse={mouse} />
          </CharacterSlot>
          <CharacterSlot eyeSize={26}>
            <TrackingEye mouse={mouse} />
          </CharacterSlot>
        </div>
        <div className="gra-puppet gra-puppet--navy">
          <CharacterSlot eyeSize={22}>
            <TrackingEye mouse={mouse} size={22} />
          </CharacterSlot>
          <CharacterSlot eyeSize={22}>
            <TrackingEye mouse={mouse} size={22} />
          </CharacterSlot>
        </div>
        <div className="gra-puppet gra-puppet--cream">
          <div className="gra-cream-face">
            <div className="gra-cream-eyes">
              <DotEye size={9} />
              <DotEye size={9} />
            </div>
            <svg width="26" height="12" viewBox="0 0 26 12" className="gra-cream-mouth-svg">
              {mood === "worried" ? (
                <path d="M3 9 Q8 3 13 7 Q18 3 23 9" fill="none" stroke="#14181c" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M3 3 Q13 11 23 3" fill="none" stroke="#14181c" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
          </div>
        </div>
      </div>

      <div className="gra-crew-labels">
        <span className="gra-label">
          <span className="gra-dot gra-dot--live" />
          Monitoring crew online
        </span>
        <span className="gra-label gra-label--right">4 active</span>
      </div>
    </div>
  );
}

const IconSparkle = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill="currentColor" />
  </svg>
);

const IconMail = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5l8.5 6 8.5-6" />
  </svg>
);

const IconLock = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

const IconEye = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
    {off && <line x1="4" y1="20" x2="20" y2="4" />}
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const { login, token, isLoading: authLoading } = useAuth();
  const { ok, err } = useToast();
  const mouse = useMousePosition();
  const [email, setEmail] = useState("admin@nirmaan.com");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mood, setMood] = useState<"happy" | "worried">("happy");
  const worriedTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && token) {
      router.replace("/overview");
    }
  }, [authLoading, token, router]);

  const triggerWorried = () => {
    setMood("worried");
    if (worriedTimerRef.current) clearTimeout(worriedTimerRef.current);
    worriedTimerRef.current = setTimeout(() => setMood("happy"), 2200);
  };

  const handleSubmit = async (payload: { email: string; password: string; keepSignedIn: boolean }) => {
    const { email: submittedEmail, password: submittedPassword } = payload;
    if (!submittedEmail || !submittedPassword) {
      triggerWorried();
      return;
    }

    if (submittedPassword.length < 6) {
      triggerWorried();
      err("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);
    try {
      await login({ email: submittedEmail, password: submittedPassword });
      ok("Signed in successfully");
      router.push("/overview");
    } catch (e: unknown) {
      triggerWorried();
      err(e instanceof Error ? e.message : "Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="gra-root">
      <div className="gra-left">
        <div className="gra-grid-overlay" />
        <div className="gra-ring gra-ring--1" />
        <div className="gra-ring gra-ring--2" />
        <div className="gra-ring gra-ring--3" />

        <div className="gra-logo">
          <span className="gra-logo-badge">
            <IconSparkle />
          </span>
          <span className="gra-logo-text">Grid Risk Advisor</span>
        </div>

        <MonitoringCrew mouse={mouse} mood={mood} />

        <div className="gra-footer">Authorized personnel only&nbsp;&nbsp;·&nbsp;&nbsp;RC4 control network</div>
      </div>

      <div className="gra-right">
        <form
          className="gra-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit({ email, password, keepSignedIn });
          }}
        >
          <div className="gra-eyebrow">Operator console / Sign in</div>
          <h1 className="gra-heading">Welcome back, operator.</h1>
          <p className="gra-subtext">Sign in to access live grid intelligence and dispatch controls.</p>

          <label className="gra-field-label" htmlFor="gra-email">
            Work email
          </label>
          <div className="gra-input-wrap">
            <span className="gra-input-icon">
              <IconMail />
            </span>
            <input
              id="gra-email"
              type="email"
              className="gra-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <label className="gra-field-label" htmlFor="gra-password">
            Password
          </label>
          <div className="gra-input-wrap">
            <span className="gra-input-icon">
              <IconLock />
            </span>
            <input
              id="gra-password"
              type={showPassword ? "text" : "password"}
              className="gra-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="gra-input-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <IconEye off={showPassword} />
            </button>
          </div>

          <div className="gra-row-between">
            <label className="gra-checkbox">
              <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
              <span>Keep me signed in</span>
            </label>
            <button
              type="button"
              className="gra-link"
              onClick={() => {
                err("Credential reset requires admin approval in simulation mode.");
              }}
            >
              Reset credentials
            </button>
          </div>

          <button type="submit" className="gra-submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in to console"}
            <IconArrow />
          </button>

          <p className="gra-signup">
            New to the command center? <Link href="/signup">Request operator access</Link>
          </p>

          <p className="gra-encrypted">
            <span className="gra-dot gra-dot--live" />
            API link encrypted&nbsp;&nbsp;·&nbsp;&nbsp;session TTL 24h
          </p>
        </form>
      </div>

      <style>{`
        .gra-root {
          --gra-teal-950: #071b28;
          --gra-teal-900: #0c2836;
          --gra-teal-700: #144a52;
          --gra-teal-500: #1c6b6f;
          --gra-teal-300: #3fa3a0;
          --gra-pink: #d79f9f;
          --gra-blue: #6c7ff2;
          --gra-navy: #333f6d;
          --gra-cream: #ded0a0;
          --gra-ink: #14181c;
          --gra-paper: #f7f5f1;

          display: flex;
          min-height: calc(100vh - 96px);
          width: 100%;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
          color: var(--gra-ink);
        }

        * { box-sizing: border-box; }

        .gra-left {
          position: relative;
          flex: 1 1 46%;
          min-width: 0;
          background: radial-gradient(120% 90% at 100% 100%, #1c4e57 0%, var(--gra-teal-900) 45%, var(--gra-teal-950) 100%);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 40px 44px;
        }

        .gra-grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 34px 34px;
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        .gra-ring {
          position: absolute;
          right: -120px;
          bottom: -160px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.08);
          pointer-events: none;
        }
        .gra-ring--1 { width: 420px; height: 420px; }
        .gra-ring--2 { width: 620px; height: 620px; right: -220px; bottom: -260px; }
        .gra-ring--3 { width: 820px; height: 820px; right: -320px; bottom: -360px; }

        .gra-logo {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 1;
        }
        .gra-logo-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--gra-teal-300);
          background: rgba(63, 163, 160, 0.12);
          color: #eafffd;
        }
        .gra-logo-text {
          color: #f2fbfa;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .gra-crew {
          position: relative;
          z-index: 1;
          margin: auto 0 64px;
        }
        .gra-crew-group {
          display: flex;
          align-items: flex-end;
          gap: 22px;
        }

        .gra-puppet {
          position: relative;
          display: flex;
          justify-content: center;
          gap: 8px;
          padding-top: 16px;
        }
        .gra-puppet--pink {
          width: 168px;
          height: 96px;
          border-radius: 50% 50% 0 0;
          background: var(--gra-pink);
          margin-right: -96px;
          align-items: flex-start;
          padding-top: 20px;
        }
        .gra-puppet--blue {
          width: 118px;
          height: 150px;
          border-radius: 34px 34px 10px 10px;
          background: var(--gra-blue);
          align-items: flex-start;
        }
        .gra-puppet--navy {
          width: 62px;
          height: 112px;
          border-radius: 22px 22px 8px 8px;
          background: var(--gra-navy);
          align-items: flex-start;
          gap: 6px;
        }
        .gra-puppet--cream {
          width: 96px;
          height: 132px;
          border-radius: 48px 48px 10px 10px;
          background: var(--gra-cream);
          align-items: flex-start;
        }

        .gra-cream-face {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          margin-top: 26px;
        }
        .gra-cream-eyes { display: flex; gap: 10px; }
        .gra-cream-mouth {
          width: 34px;
          height: 2px;
          background: var(--gra-ink);
          opacity: 0.75;
        }
        .gra-cream-mouth-svg { display: block; }

        .gra-eye-slot {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: height 110ms ease;
        }

        .gra-eye {
          border-radius: 50%;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
        }
        .gra-pupil {
          border-radius: 50%;
          background: #1a1a1f;
          transition: transform 70ms linear;
        }
        .gra-dot-eye {
          border-radius: 50%;
          background: var(--gra-ink);
          transition: height 110ms ease, opacity 110ms ease;
        }

        .gra-crew--worried .gra-puppet {
          transform: translateY(3px) scale(0.97);
          transition: transform 180ms ease;
        }

        .gra-crew-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 18px;
          padding: 0 4px 0 2px;
        }
        .gra-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.6);
        }
        .gra-label--right { color: rgba(255,255,255,0.5); }

        .gra-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
        }
        .gra-dot--live {
          background: #4ad9a8;
          box-shadow: 0 0 0 3px rgba(74, 217, 168, 0.18);
        }

        .gra-footer {
          position: relative;
          z-index: 1;
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }

        .gra-right {
          flex: 1 1 54%;
          min-width: 0;
          background: var(--gra-paper);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .gra-form {
          width: 100%;
          max-width: 400px;
        }

        .gra-eyebrow {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8a8a8a;
          margin-bottom: 14px;
        }
        .gra-heading {
          font-size: 30px;
          line-height: 1.2;
          font-weight: 700;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }
        .gra-subtext {
          font-size: 14.5px;
          color: #6b6b6b;
          margin: 0 0 28px;
          line-height: 1.5;
        }

        .gra-field-label {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
          color: #4a4a4a;
          margin: 0 0 6px;
        }

        .gra-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 18px;
        }
        .gra-input-icon {
          position: absolute;
          left: 13px;
          display: flex;
          color: #9a9a9a;
          pointer-events: none;
        }
        .gra-input {
          width: 100%;
          padding: 12px 14px 12px 38px;
          border-radius: 9px;
          border: 1px solid #e2e0da;
          background: #fbfaf7;
          font-size: 14.5px;
          color: var(--gra-ink);
          outline: none;
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .gra-input::placeholder { color: #b3b0a8; }
        .gra-input:focus {
          border-color: var(--gra-teal-500);
          box-shadow: 0 0 0 3px rgba(28, 107, 111, 0.12);
        }
        .gra-input-toggle {
          position: absolute;
          right: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: #9a9a9a;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
        }
        .gra-input-toggle:hover { color: #5a5a5a; background: #efece5; }

        .gra-row-between {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
        }
        .gra-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          color: #55554f;
          cursor: pointer;
        }
        .gra-checkbox input { accent-color: var(--gra-teal-500); width: 15px; height: 15px; }
        .gra-link {
          background: none;
          border: none;
          padding: 0;
          font-size: 13.5px;
          color: var(--gra-teal-700);
          text-decoration: none;
          font-weight: 600;
          cursor: pointer;
        }
        .gra-link:hover { text-decoration: underline; }

        .gra-submit {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px 16px;
          border-radius: 9px;
          border: none;
          background: linear-gradient(180deg, var(--gra-teal-500), var(--gra-teal-700));
          color: #fff;
          font-size: 14.5px;
          font-weight: 600;
          cursor: pointer;
          transition: filter 120ms ease, transform 120ms ease;
        }
        .gra-submit:hover { filter: brightness(1.08); }
        .gra-submit:active { transform: translateY(1px); }
        .gra-submit:disabled { cursor: wait; opacity: 0.8; }

        .gra-signup {
          text-align: center;
          font-size: 13.5px;
          color: #6b6b6b;
          margin: 18px 0 30px;
        }
        .gra-signup a {
          color: var(--gra-teal-700);
          font-weight: 600;
          text-decoration: none;
        }
        .gra-signup a:hover { text-decoration: underline; }

        .gra-encrypted {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a8a59c;
        }

        @media (max-width: 860px) {
          .gra-root { flex-direction: column; }
          .gra-left, .gra-right { flex: none; width: 100%; }
          .gra-left { padding: 32px 28px 40px; }
          .gra-crew { margin: 40px 0; }
          .gra-right { padding: 36px 24px; }
        }
      `}</style>
    </div>
  );
}
