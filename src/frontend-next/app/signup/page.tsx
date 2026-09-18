"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function SignupPage() {
  const router = useRouter();
  const { signup, token, isLoading: authLoading } = useAuth();
  const { ok, err } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Mascot Refs
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const purpleEyesRef = useRef<HTMLDivElement>(null);
  const blackEyesRef = useRef<HTMLDivElement>(null);
  const orangeEyesRef = useRef<HTMLDivElement>(null);
  const yellowEyesRef = useRef<HTMLDivElement>(null);
  const yellowMouthRef = useRef<HTMLDivElement>(null);

  const purpleEye1Ref = useRef<HTMLDivElement>(null);
  const purpleEye2Ref = useRef<HTMLDivElement>(null);
  const blackEye1Ref = useRef<HTMLDivElement>(null);
  const blackEye2Ref = useRef<HTMLDivElement>(null);

  const purplePupil1Ref = useRef<HTMLDivElement>(null);
  const purplePupil2Ref = useRef<HTMLDivElement>(null);
  const blackPupil1Ref = useRef<HTMLDivElement>(null);
  const blackPupil2Ref = useRef<HTMLDivElement>(null);
  const orangePupil1Ref = useRef<HTMLDivElement>(null);
  const orangePupil2Ref = useRef<HTMLDivElement>(null);
  const yellowPupil1Ref = useRef<HTMLDivElement>(null);
  const yellowPupil2Ref = useRef<HTMLDivElement>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const anim = useRef({
    mouseX: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    mouseY: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    isTyping: false,
    showPassword: false,
    passwordLength: 0,
    isPurpleBlinking: false,
    isBlackBlinking: false,
    isLookingAtEachOther: false,
    isPurplePeeking: false,
  }).current;

  const timers = useRef<{
    lookTimer: NodeJS.Timeout | null;
    peekTimer: NodeJS.Timeout | null;
    peekResetTimer: NodeJS.Timeout | null;
    isPurpleBlinking: NodeJS.Timeout | null;
    isPurpleBlinkingReset: NodeJS.Timeout | null;
    isBlackBlinking: NodeJS.Timeout | null;
    isBlackBlinkingReset: NodeJS.Timeout | null;
  }>({
    lookTimer: null,
    peekTimer: null,
    peekResetTimer: null,
    isPurpleBlinking: null,
    isPurpleBlinkingReset: null,
    isBlackBlinking: null,
    isBlackBlinkingReset: null,
  }).current;

  useEffect(() => {
    if (!authLoading && token) {
      router.replace("/overview");
    }
  }, [authLoading, token, router]);

  function calculatePupilPosition(
    element: HTMLElement | null,
    maxDistance: number,
    forceLookX?: number,
    forceLookY?: number
  ) {
    if (!element) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = anim.mouseX - centerX;
    const deltaY = anim.mouseY - centerY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  }

  function calculatePosition(element: HTMLElement | null) {
    if (!element) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = anim.mouseX - centerX;
    const deltaY = anim.mouseY - centerY;
    return {
      faceX: clamp(deltaX / 20, -15, 15),
      faceY: clamp(deltaY / 30, -10, 10),
      bodySkew: clamp(-deltaX / 120, -6, 6),
    };
  }

  function setElementTranslate(element: HTMLElement | null, position: { x: number; y: number }) {
    if (element) element.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }

  function updateEyeBall(
    eyeElement: HTMLElement | null,
    pupilElement: HTMLElement | null,
    options: {
      size: number;
      maxDistance: number;
      isBlinking: boolean;
      forceLookX?: number;
      forceLookY?: number;
    }
  ) {
    const { size, maxDistance, isBlinking, forceLookX, forceLookY } = options;
    if (!eyeElement || !pupilElement) return;
    eyeElement.style.width = `${size}px`;
    eyeElement.style.height = isBlinking ? "2px" : `${size}px`;
    pupilElement.style.display = isBlinking ? "none" : "block";
    if (!isBlinking) {
      const position = calculatePupilPosition(eyeElement, maxDistance, forceLookX, forceLookY);
      setElementTranslate(pupilElement, position);
    }
  }

  function updatePupil(
    element: HTMLElement | null,
    options: { maxDistance: number; forceLookX?: number; forceLookY?: number }
  ) {
    const { maxDistance, forceLookX, forceLookY } = options;
    const position = calculatePupilPosition(element, maxDistance, forceLookX, forceLookY);
    setElementTranslate(element, position);
  }

  function renderCharacters() {
    const purplePos = calculatePosition(purpleRef.current);
    const blackPos = calculatePosition(blackRef.current);
    const yellowPos = calculatePosition(yellowRef.current);
    const orangePos = calculatePosition(orangeRef.current);
    const isHidingPassword = anim.passwordLength > 0 && !anim.showPassword;

    if (purpleRef.current) {
      purpleRef.current.style.height = anim.isTyping || isHidingPassword ? "440px" : "400px";
      purpleRef.current.style.transform =
        anim.passwordLength > 0 && anim.showPassword
          ? "skewX(0deg)"
          : anim.isTyping || isHidingPassword
          ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)`
          : `skewX(${purplePos.bodySkew || 0}deg)`;
    }

    if (blackRef.current) {
      blackRef.current.style.transform =
        anim.passwordLength > 0 && anim.showPassword
          ? "skewX(0deg)"
          : anim.isLookingAtEachOther
          ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)`
          : anim.isTyping || isHidingPassword
          ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)`
          : `skewX(${blackPos.bodySkew || 0}deg)`;
    }

    if (orangeRef.current) {
      orangeRef.current.style.transform =
        anim.passwordLength > 0 && anim.showPassword ? "skewX(0deg)" : `skewX(${orangePos.bodySkew || 0}deg)`;
    }

    if (yellowRef.current) {
      yellowRef.current.style.transform =
        anim.passwordLength > 0 && anim.showPassword ? "skewX(0deg)" : `skewX(${yellowPos.bodySkew || 0}deg)`;
    }

    if (purpleEyesRef.current) {
      purpleEyesRef.current.style.left =
        anim.passwordLength > 0 && anim.showPassword ? "20px" : anim.isLookingAtEachOther ? "55px" : `${45 + purplePos.faceX}px`;
      purpleEyesRef.current.style.top =
        anim.passwordLength > 0 && anim.showPassword ? "35px" : anim.isLookingAtEachOther ? "65px" : `${40 + purplePos.faceY}px`;
    }
    if (blackEyesRef.current) {
      blackEyesRef.current.style.left =
        anim.passwordLength > 0 && anim.showPassword ? "10px" : anim.isLookingAtEachOther ? "32px" : `${26 + blackPos.faceX}px`;
      blackEyesRef.current.style.top =
        anim.passwordLength > 0 && anim.showPassword ? "28px" : anim.isLookingAtEachOther ? "12px" : `${32 + blackPos.faceY}px`;
    }
    if (orangeEyesRef.current) {
      orangeEyesRef.current.style.left =
        anim.passwordLength > 0 && anim.showPassword ? "50px" : `${82 + (orangePos.faceX || 0)}px`;
      orangeEyesRef.current.style.top =
        anim.passwordLength > 0 && anim.showPassword ? "85px" : `${90 + (orangePos.faceY || 0)}px`;
    }
    if (yellowEyesRef.current) {
      yellowEyesRef.current.style.left =
        anim.passwordLength > 0 && anim.showPassword ? "20px" : `${52 + (yellowPos.faceX || 0)}px`;
      yellowEyesRef.current.style.top =
        anim.passwordLength > 0 && anim.showPassword ? "35px" : `${40 + (yellowPos.faceY || 0)}px`;
    }
    if (yellowMouthRef.current) {
      yellowMouthRef.current.style.left =
        anim.passwordLength > 0 && anim.showPassword ? "10px" : `${40 + (yellowPos.faceX || 0)}px`;
      yellowMouthRef.current.style.top =
        anim.passwordLength > 0 && anim.showPassword ? "88px" : `${88 + (yellowPos.faceY || 0)}px`;
    }

    const purpleForceX =
      anim.passwordLength > 0 && anim.showPassword ? (anim.isPurplePeeking ? 4 : -4) : anim.isLookingAtEachOther ? 3 : undefined;
    const purpleForceY =
      anim.passwordLength > 0 && anim.showPassword ? (anim.isPurplePeeking ? 5 : -4) : anim.isLookingAtEachOther ? 4 : undefined;
    const blackForceX = anim.passwordLength > 0 && anim.showPassword ? -4 : anim.isLookingAtEachOther ? 0 : undefined;
    const blackForceY = anim.passwordLength > 0 && anim.showPassword ? -4 : anim.isLookingAtEachOther ? -4 : undefined;
    const frontForceX = anim.passwordLength > 0 && anim.showPassword ? -5 : undefined;
    const frontForceY = anim.passwordLength > 0 && anim.showPassword ? -4 : undefined;

    updateEyeBall(purpleEye1Ref.current, purplePupil1Ref.current, {
      size: 18,
      maxDistance: 5,
      isBlinking: anim.isPurpleBlinking,
      forceLookX: purpleForceX,
      forceLookY: purpleForceY,
    });
    updateEyeBall(purpleEye2Ref.current, purplePupil2Ref.current, {
      size: 18,
      maxDistance: 5,
      isBlinking: anim.isPurpleBlinking,
      forceLookX: purpleForceX,
      forceLookY: purpleForceY,
    });
    updateEyeBall(blackEye1Ref.current, blackPupil1Ref.current, {
      size: 16,
      maxDistance: 4,
      isBlinking: anim.isBlackBlinking,
      forceLookX: blackForceX,
      forceLookY: blackForceY,
    });
    updateEyeBall(blackEye2Ref.current, blackPupil2Ref.current, {
      size: 16,
      maxDistance: 4,
      isBlinking: anim.isBlackBlinking,
      forceLookX: blackForceX,
      forceLookY: blackForceY,
    });
    updatePupil(orangePupil1Ref.current, { maxDistance: 5, forceLookX: frontForceX, forceLookY: frontForceY });
    updatePupil(orangePupil2Ref.current, { maxDistance: 5, forceLookX: frontForceX, forceLookY: frontForceY });
    updatePupil(yellowPupil1Ref.current, { maxDistance: 5, forceLookX: frontForceX, forceLookY: frontForceY });
    updatePupil(yellowPupil2Ref.current, { maxDistance: 5, forceLookX: frontForceX, forceLookY: frontForceY });
  }

  function scheduleBlink(key: "isPurpleBlinking" | "isBlackBlinking") {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    timers[key] = setTimeout(() => {
      anim[key] = true;
      renderCharacters();
      timers[`${key}Reset`] = setTimeout(() => {
        anim[key] = false;
        renderCharacters();
        scheduleBlink(key);
      }, 150);
    }, getRandomBlinkInterval());
  }

  function triggerLookingAtEachOther() {
    anim.isLookingAtEachOther = true;
    renderCharacters();
    if (timers.lookTimer) clearTimeout(timers.lookTimer);
    timers.lookTimer = setTimeout(() => {
      anim.isLookingAtEachOther = false;
      renderCharacters();
    }, 800);
  }

  function schedulePeek() {
    if (timers.peekTimer) clearTimeout(timers.peekTimer);
    if (timers.peekResetTimer) clearTimeout(timers.peekResetTimer);
    if (anim.passwordLength > 0 && anim.showPassword) {
      timers.peekTimer = setTimeout(() => {
        anim.isPurplePeeking = true;
        renderCharacters();
        timers.peekResetTimer = setTimeout(() => {
          anim.isPurplePeeking = false;
          renderCharacters();
          schedulePeek();
        }, 800);
      }, Math.random() * 3000 + 2000);
    } else {
      anim.isPurplePeeking = false;
      renderCharacters();
    }
  }

  function validateForm() {
    const emailVal = emailInputRef.current ? emailInputRef.current.value.trim() : email.trim();
    const passwordVal = passwordInputRef.current ? passwordInputRef.current.value : password;
    let valid = true;

    if (!emailVal || !emailVal.includes("@")) {
      setEmailError("Please enter a valid work email.");
      valid = false;
    } else {
      setEmailError("");
    }

    if (passwordVal.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else if (password !== confirmPassword && confirmPassword.length > 0) {
      setPasswordError("Passwords do not match.");
      valid = false;
    } else {
      setPasswordError("");
    }

    return valid;
  }

  function handleEmailFocus() {
    anim.isTyping = true;
    triggerLookingAtEachOther();
    renderCharacters();
  }

  function handleEmailBlur() {
    anim.isTyping = false;
    validateForm();
    renderCharacters();
  }

  function handlePasswordFocus() {
    anim.isTyping = true;
    triggerLookingAtEachOther();
    renderCharacters();
  }

  function handlePasswordBlur() {
    anim.isTyping = false;
    validateForm();
    renderCharacters();
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
    anim.passwordLength = e.target.value.length;
    schedulePeek();
    validateForm();
    renderCharacters();
  }

  function handleTogglePassword() {
    setShowPassword((prev) => {
      const next = !prev;
      anim.showPassword = next;
      schedulePeek();
      renderCharacters();
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      err("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await signup({ email, password });
      ok("Operator account created successfully");
      router.push("/overview");
    } catch (e: any) {
      err(e.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      anim.mouseX = event.clientX;
      anim.mouseY = event.clientY;
      renderCharacters();
    }
    window.addEventListener("mousemove", handleMouseMove);
    scheduleBlink("isPurpleBlinking");
    scheduleBlink("isBlackBlinking");
    renderCharacters();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (timers.lookTimer) clearTimeout(timers.lookTimer);
      if (timers.peekTimer) clearTimeout(timers.peekTimer);
      if (timers.peekResetTimer) clearTimeout(timers.peekResetTimer);
      if (timers.isPurpleBlinking) clearTimeout(timers.isPurpleBlinking);
      if (timers.isPurpleBlinkingReset) clearTimeout(timers.isPurpleBlinkingReset);
      if (timers.isBlackBlinking) clearTimeout(timers.isBlackBlinking);
      if (timers.isBlackBlinkingReset) clearTimeout(timers.isBlackBlinkingReset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        :root {
          --background: 0 0% 100%;
          --foreground: 222.2 84% 4.9%;
          --card: 0 0% 100%;
          --card-foreground: 222.2 84% 4.9%;
          --popover: 0 0% 100%;
          --popover-foreground: 222.2 84% 4.9%;
          --primary: 153 100% 16%;
          --primary-foreground: 0 0% 98%;
          --secondary: 210 40% 96.1%;
          --secondary-foreground: 215.4 16.3% 46.9%;
          --muted: 210 40% 96.1%;
          --muted-foreground: 215.4 16.3% 46.9%;
          --accent: 210 40% 96.1%;
          --accent-foreground: 215.4 16.3% 46.9%;
          --destructive: 359 100% 65%;
          --destructive-foreground: 0 0% 98%;
          --border: 214.3 31.8% 91.4%;
          --input: 214.3 31.8% 91.4%;
          --ring: 153 100% 16%;
          --radius: 0.5rem;
        }
        .wk-login * { box-sizing: border-box; }
        .wk-login { font-family: Inter, sans-serif; background: hsl(var(--background)); color: hsl(var(--foreground)); }
        .bg-grid-white-5 {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        .eye-ball {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          overflow: hidden;
          transition: all 150ms;
        }
        .character-transition { transition: all 700ms ease-in-out; transform-origin: bottom center; }
        .face-transition { transition: all 700ms ease-in-out; }
        .fast-face-transition { transition: all 200ms ease-out; }
        .pupil-transition { transition: transform 0.1s ease-out; }
      `}</style>

      <div className="wk-login min-h-screen max-h-screen overflow-hidden grid lg:grid-cols-2">
        {/* Left panel: Wukong animated mascots */}
        <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#082b25] via-[#0c3931] to-[#002117] p-12 text-white">
          <div className="relative z-20">
            <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-wide">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-[#95d4ac]/40 bg-white/10 backdrop-blur-sm flex items-center justify-center p-0.5">
                <Image src="/favicon.png" alt="Grid Risk Advisor" width={28} height={28} className="object-cover" />
              </div>
              <span className="font-mono text-sm tracking-wider uppercase">Grid Risk Advisor</span>
            </Link>
          </div>

          <div className="relative z-20 flex items-end justify-center h-[500px]">
            <div className="relative" style={{ width: 550, height: 400 }}>
              <div
                ref={purpleRef}
                className="absolute bottom-0 character-transition"
                style={{ left: 70, width: 180, height: 400, backgroundColor: "#6C3FF5", borderRadius: "10px 10px 0 0", zIndex: 1 }}
              >
                <div ref={purpleEyesRef} className="absolute flex gap-8 face-transition" style={{ left: 45, top: 40 }}>
                  <div ref={purpleEye1Ref} className="eye-ball" style={{ width: 18, height: 18, backgroundColor: "white" }}>
                    <div ref={purplePupil1Ref} className="rounded-full pupil-transition" style={{ width: 7, height: 7, backgroundColor: "#2D2D2D" }} />
                  </div>
                  <div ref={purpleEye2Ref} className="eye-ball" style={{ width: 18, height: 18, backgroundColor: "white" }}>
                    <div ref={purplePupil2Ref} className="rounded-full pupil-transition" style={{ width: 7, height: 7, backgroundColor: "#2D2D2D" }} />
                  </div>
                </div>
              </div>

              <div
                ref={blackRef}
                className="absolute bottom-0 character-transition"
                style={{ left: 240, width: 120, height: 310, backgroundColor: "#2D2D2D", borderRadius: "8px 8px 0 0", zIndex: 2 }}
              >
                <div ref={blackEyesRef} className="absolute flex gap-6 face-transition" style={{ left: 26, top: 32 }}>
                  <div ref={blackEye1Ref} className="eye-ball" style={{ width: 16, height: 16, backgroundColor: "white" }}>
                    <div ref={blackPupil1Ref} className="rounded-full pupil-transition" style={{ width: 6, height: 6, backgroundColor: "#2D2D2D" }} />
                  </div>
                  <div ref={blackEye2Ref} className="eye-ball" style={{ width: 16, height: 16, backgroundColor: "white" }}>
                    <div ref={blackPupil2Ref} className="rounded-full pupil-transition" style={{ width: 6, height: 6, backgroundColor: "#2D2D2D" }} />
                  </div>
                </div>
              </div>

              <div
                ref={orangeRef}
                className="absolute bottom-0 character-transition"
                style={{ left: 0, width: 240, height: 200, backgroundColor: "#FF9B6B", borderRadius: "120px 120px 0 0", zIndex: 3 }}
              >
                <div ref={orangeEyesRef} className="absolute flex gap-8 fast-face-transition" style={{ left: 82, top: 90 }}>
                  <div ref={orangePupil1Ref} className="rounded-full pupil-transition" style={{ width: 12, height: 12, backgroundColor: "#2D2D2D" }} />
                  <div ref={orangePupil2Ref} className="rounded-full pupil-transition" style={{ width: 12, height: 12, backgroundColor: "#2D2D2D" }} />
                </div>
              </div>

              <div
                ref={yellowRef}
                className="absolute bottom-0 character-transition"
                style={{ left: 310, width: 140, height: 230, backgroundColor: "#E8D754", borderRadius: "70px 70px 0 0", zIndex: 4 }}
              >
                <div ref={yellowEyesRef} className="absolute flex gap-6 fast-face-transition" style={{ left: 52, top: 40 }}>
                  <div ref={yellowPupil1Ref} className="rounded-full pupil-transition" style={{ width: 12, height: 12, backgroundColor: "#2D2D2D" }} />
                  <div ref={yellowPupil2Ref} className="rounded-full pupil-transition" style={{ width: 12, height: 12, backgroundColor: "#2D2D2D" }} />
                </div>
                <div
                  ref={yellowMouthRef}
                  className="absolute w-20 h-[4px] bg-[#2D2D2D] rounded-full fast-face-transition"
                  style={{ left: 40, top: 88 }}
                />
              </div>
            </div>
          </div>

          <div className="relative z-20 flex items-center gap-8 text-xs font-mono text-[#84c39b]">
            <span>AUTHORIZED PERSONNEL ONLY</span>
            <span>&bull;</span>
            <span>RC4 CONTROL NETWORK</span>
          </div>

          <div className="absolute inset-0 bg-grid-white-5 opacity-30" />
          <div className="absolute top-1/4 right-1/4 size-64 bg-[#95d4ac]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/4 size-96 bg-[#003820]/40 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Right panel: signup form */}
        <div className="flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-[420px]">
            <div className="lg:hidden flex items-center justify-center gap-2 text-lg font-semibold mb-12">
              <Image src="/favicon.png" alt="Grid Risk Advisor" width={32} height={32} />
              <span className="font-mono text-sm tracking-wider uppercase">Grid Risk Advisor</span>
            </div>

            <div className="mb-8">
              <div className="font-mono text-[11px] font-bold text-[#0f5132] uppercase tracking-wider mb-2">
                Operator Console / Access Request
              </div>
              <h1 className="text-3xl font-bold tracking-tight mb-2 text-[#0b1c30]">Register Account</h1>
              <p className="text-muted-foreground text-sm">Provision access for the grid command center</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-mono font-bold uppercase text-[#404942]">Work Email</label>
                <input
                  id="email"
                  ref={emailInputRef}
                  type="email"
                  required
                  placeholder="operator@utility.example"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={handleEmailFocus}
                  onBlur={handleEmailBlur}
                  className="flex h-11 w-full rounded-full border border-border/60 bg-background px-4 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                />
                {emailError && <p className="text-xs text-[#ba1a1a] font-mono">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-mono font-bold uppercase text-[#404942]">Create Password (min 8 chars)</label>
                <div className="relative">
                  <input
                    id="password"
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={password}
                    onChange={handlePasswordChange}
                    onFocus={handlePasswordFocus}
                    onBlur={handlePasswordBlur}
                    className="flex h-11 w-full rounded-full border border-border/60 bg-background px-4 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleTogglePassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {showPassword ? (
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M10.58 10.58A2 2 0 0013.42 13.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M9.88 5.09A10.94 10.94 0 0112 4.9C16.6 4.9 20.2 7.4 22 10.9A17.2 17.2 0 0118.91 15.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.1 6.1C4.38 7.3 3 8.93 2 10.9C3.8 14.4 7.4 16.9 12 16.9C13.27 16.9 14.48 16.71 15.6 16.36" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2 12C3.8 8.5 7.4 6 12 6C16.6 6 20.2 8.5 22 12C20.2 15.5 16.6 18 12 18C7.4 18 3.8 15.5 2 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-xs font-mono font-bold uppercase text-[#404942]">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex h-11 w-full rounded-full border border-border/60 bg-background px-4 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                />
                {passwordError && <p className="text-xs text-[#ba1a1a] font-mono">{passwordError}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full h-11 cursor-pointer overflow-hidden rounded-full border border-[#003820] bg-[#0f5132] text-white px-6 py-2 text-center font-semibold disabled:opacity-50 mt-2"
              >
                <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
                  {isLoading ? "Provisioning..." : "Create Operator Account"}
                </span>
                <span className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#003820] text-white opacity-0 transition-all duration-300 group-hover:opacity-100 rounded-full">
                  <span>{isLoading ? "Provisioning..." : "Create Operator Account"}</span>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </form>

            <div className="text-center text-sm text-muted-foreground mt-6">
              Already have an operator account?{" "}
              <Link href="/login" className="text-[#0f5132] hover:underline font-semibold">
                Sign in to console
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
