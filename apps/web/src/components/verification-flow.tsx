"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  FileCheck2,
  Globe2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const steps = ["Location", "Identity", "Document", "Selfie", "Review"];

type CameraMode = "document" | "selfie";

export function VerificationFlow() {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("PH");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [documentType, setDocumentType] = useState("passport");
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionReference, setSubmissionReference] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraMode(null);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step, submitted]);

  useEffect(() => {
    if (!cameraMode || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [cameraMode]);

  async function startCamera(mode: CameraMode) {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser. Use file upload instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: mode === "selfie" ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraMode(mode);
    } catch {
      setCameraError("Camera permission was not granted. Allow access or upload a clear image.");
    }
  }

  function captureImage() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.9);
    if (cameraMode === "selfie") setSelfieImage(image);
    else setDocumentImage(image);
    stopCamera();
  }

  function acceptFile(file: File | undefined, mode: CameraMode) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      if (mode === "selfie") setSelfieImage(reader.result);
      else setDocumentImage(reader.result);
      setCameraError("");
    };
    reader.readAsDataURL(file);
  }

  async function submitVerification() {
    setSubmitting(true);
    setSubmissionError("");
    try {
      const response = await fetch("/api/kyc/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          countryCode: country,
          documentType: documentType === "national-id" ? "national_id" : documentType === "license" ? "drivers_license" : "passport",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.reference) throw new Error(result.error || "Verification could not be submitted.");
      setSubmissionReference(result.reference);
      setDocumentImage(null);
      setSelfieImage(null);
      setSubmitted(true);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Verification could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const countryName = country === "PH" ? "Philippines" : country === "US" ? "United States" : country === "GB" ? "United Kingdom" : country === "SG" ? "Singapore" : country === "AE" ? "United Arab Emirates" : country === "JP" ? "Japan" : country === "CA" ? "Canada" : "Australia";
  const documentName = documentType === "passport" ? "Passport" : documentType === "national-id" ? "National identity card" : "Driver's license";

  return (
    <main className="kyc-experience">
      <header className="kyc-topbar">
        <Link className="kyc-brand" href="/" aria-label="Padalix application">
          <i><b /><b /><b /></i><strong>PADALIX</strong><span>IDENTITY</span>
        </Link>
        <div className="kyc-secure"><LockKeyhole size={14} /><span>ENCRYPTED SESSION</span></div>
        <Link className="kyc-exit" href="/" aria-label="Exit verification"><X size={19} /></Link>
      </header>

      <div className="kyc-workspace">
        <aside className="kyc-context">
          <div>
            <p>IDENTITY / QUALIFICATION</p>
            <h1>One check.<br />More access.</h1>
            <span>Verify your identity to send funds, cash out, and unlock higher account limits.</span>
          </div>
          <ol aria-label="Verification progress">
            {steps.map((label, index) => (
              <li className={index === step ? "current" : index < step ? "complete" : ""} key={label}>
                <i>{index < step ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</i>
                <span><small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{label}</strong></span>
              </li>
            ))}
          </ol>
          <footer><ShieldCheck size={16} /><span>Your information is used only for identity verification and regulatory screening.</span></footer>
        </aside>

        <section className="kyc-stage" aria-live="polite">
          {submitted ? (
            <div className="kyc-panel kyc-success">
              <div className="success-mark"><CheckCircle2 size={42} /></div>
              <p>VERIFICATION / RECEIVED</p>
              <h2>Your identity check is ready for review.</h2>
              <span>Automated checks will assess document authenticity and liveness. A reviewer will step in when a decision needs human judgment.</span>
              <dl>
                <div><dt>Reference</dt><dd>{submissionReference}</dd></div>
                <div><dt>Expected update</dt><dd>Within 24 hours</dd></div>
                <div><dt>Account access</dt><dd>Basic remains active</dd></div>
              </dl>
              <Link className="kyc-primary" href="/">RETURN TO ACCOUNT <ArrowRight size={17} /></Link>
            </div>
          ) : step === 0 ? (
            <div className="kyc-panel">
              <div className="panel-icon"><Globe2 size={25} /></div>
              <p>STEP 01 / LOCATION</p>
              <h2>Where do you live?</h2>
              <span>Choose your country of residence. We will show the identity documents accepted in your region.</span>
              <label className="kyc-field">
                <span>COUNTRY OF RESIDENCE</span>
                <select value={country} onChange={(event) => setCountry(event.target.value)}>
                  <option value="PH">Philippines</option><option value="US">United States</option>
                  <option value="CA">Canada</option><option value="GB">United Kingdom</option>
                  <option value="SG">Singapore</option><option value="AE">United Arab Emirates</option>
                  <option value="JP">Japan</option><option value="AU">Australia</option>
                </select>
              </label>
              <button className="kyc-primary" onClick={() => setStep(1)}>CONTINUE <ArrowRight size={17} /></button>
            </div>
          ) : step === 1 ? (
            <div className="kyc-panel">
              <div className="panel-icon"><FileCheck2 size={25} /></div>
              <p>STEP 02 / IDENTITY</p>
              <h2>Confirm your identity.</h2>
              <span>Enter your legal details, then choose a valid, unexpired government document.</span>
              <div className="identity-fields">
                <label className="kyc-field"><span>FULL LEGAL NAME</span><input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="As shown on your document" /></label>
                <label className="kyc-field"><span>EMAIL ADDRESS</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
              </div>
              <div className="document-options">
                {[{ id: "passport", label: "Passport", note: "Photo page" }, { id: "national-id", label: "National identity card", note: "Front and back" }, { id: "license", label: "Driver's license", note: "Front and back" }].map((item) => (
                  <button className={documentType === item.id ? "selected" : ""} key={item.id} onClick={() => setDocumentType(item.id)}>
                    <FileCheck2 size={20} /><span><strong>{item.label}</strong><small>{item.note}</small></span><i>{documentType === item.id && <Check size={13} />}</i>
                  </button>
                ))}
              </div>
              <div className="kyc-actions"><button className="kyc-back" onClick={() => setStep(0)}><ArrowLeft size={17} /> BACK</button><button className="kyc-primary" disabled={fullName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => setStep(2)}>USE THIS DOCUMENT <ArrowRight size={17} /></button></div>
            </div>
          ) : step === 2 ? (
            <div className="kyc-panel capture-panel">
              <p>STEP 03 / DOCUMENT</p>
              <h2>Capture your {documentName.toLowerCase()}.</h2>
              <span>Place the document on a dark surface. Keep every corner visible and avoid glare.</span>
              {cameraMode === "document" ? (
                <div className="camera-view document-camera">
                  <video ref={videoRef} playsInline muted />
                  <div className="capture-frame"><i /><i /><i /><i /><b /></div>
                  <div className="camera-status"><span><i />LIVE CAMERA</span><small>ALIGN DOCUMENT INSIDE FRAME</small></div>
                  <button className="shutter" onClick={captureImage} aria-label="Capture document"><i /></button>
                </div>
              ) : documentImage ? (
                <div className="capture-preview"><Image src={documentImage} alt="Captured identity document" fill unoptimized /><div><Check size={15} /> IMAGE CAPTURED</div><button onClick={() => setDocumentImage(null)}><RefreshCw size={15} /> RETAKE</button></div>
              ) : (
                <div className="capture-choice">
                  <Camera size={31} /><strong>Use your camera</strong><span>We will guide you to position the document correctly.</span>
                  <button onClick={() => void startCamera("document")}><Camera size={17} /> OPEN CAMERA</button>
                  <label><Upload size={16} /> UPLOAD IMAGE<input type="file" accept="image/jpeg,image/png" onChange={(event) => acceptFile(event.target.files?.[0], "document")} /></label>
                </div>
              )}
              {cameraError && <p className="camera-error">{cameraError}</p>}
              {!cameraMode && <div className="kyc-actions"><button className="kyc-back" onClick={() => setStep(1)}><ArrowLeft size={17} /> BACK</button><button className="kyc-primary" disabled={!documentImage} onClick={() => setStep(3)}>CONTINUE <ArrowRight size={17} /></button></div>}
            </div>
          ) : step === 3 ? (
            <div className="kyc-panel capture-panel">
              <p>STEP 04 / SELFIE</p>
              <h2>Let&apos;s confirm it is you.</h2>
              <span>Remove glasses or headwear, face a light source, and keep your expression neutral.</span>
              {cameraMode === "selfie" ? (
                <div className="camera-view selfie-camera">
                  <video ref={videoRef} playsInline muted />
                  <div className="face-guide"><i /><b /></div>
                  <div className="camera-status"><span><i />LIVENESS CHECK</span><small>POSITION YOUR FACE IN THE OVAL</small></div>
                  <button className="shutter" onClick={captureImage} aria-label="Capture selfie"><i /></button>
                </div>
              ) : selfieImage ? (
                <div className="capture-preview selfie-preview"><Image src={selfieImage} alt="Captured verification selfie" fill unoptimized /><div><Check size={15} /> SELFIE CAPTURED</div><button onClick={() => setSelfieImage(null)}><RefreshCw size={15} /> RETAKE</button></div>
              ) : (
                <div className="liveness-intro">
                  <div className="face-animation"><UserRoundCheck size={46} /><i /><i /><i /></div>
                  <strong>Quick liveness check</strong><span>You may be asked to turn your head. This helps prevent impersonation and photo replay.</span>
                  <button onClick={() => void startCamera("selfie")}><Camera size={17} /> START CAMERA</button>
                  <label><Upload size={16} /> USE PHOTO FALLBACK<input type="file" accept="image/jpeg,image/png" capture="user" onChange={(event) => acceptFile(event.target.files?.[0], "selfie")} /></label>
                </div>
              )}
              {cameraError && <p className="camera-error">{cameraError}</p>}
              {!cameraMode && <div className="kyc-actions"><button className="kyc-back" onClick={() => setStep(2)}><ArrowLeft size={17} /> BACK</button><button className="kyc-primary" disabled={!selfieImage} onClick={() => setStep(4)}>CONTINUE <ArrowRight size={17} /></button></div>}
            </div>
          ) : (
            <div className="kyc-panel">
              <div className="panel-icon"><ShieldCheck size={25} /></div>
              <p>STEP 05 / REVIEW</p>
              <h2>Confirm and submit.</h2>
              <span>Check the verification package before sending it for automated qualification and, when needed, manual review.</span>
              <dl className="review-list">
                <div><dt>Legal name</dt><dd>{fullName}</dd></div>
                <div><dt>Email</dt><dd>{email}</dd></div>
                <div><dt>Country</dt><dd>{countryName}</dd></div>
                <div><dt>Document</dt><dd>{documentName}</dd></div>
                <div><dt>Evidence</dt><dd><Check size={14} /> Document and selfie ready</dd></div>
                <div><dt>Target level</dt><dd>Verified account</dd></div>
              </dl>
              <label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i>{consent && <Check size={13} />}</i><span>I consent to document authenticity, facial matching, liveness, fraud-prevention, and regulatory screening checks described in the privacy notice.</span></label>
              {submissionError && <p className="submission-error">{submissionError}</p>}
              <div className="kyc-actions"><button className="kyc-back" onClick={() => setStep(3)}><ArrowLeft size={17} /> BACK</button><button className="kyc-primary" disabled={!consent || submitting} onClick={() => void submitVerification()}>{submitting ? <><RefreshCw className="spin" size={17} /> PROCESSING</> : <>SUBMIT SECURELY <ArrowRight size={17} /></>}</button></div>
              <small className="preview-notice">SECURE SUBMISSION / REVIEW STATUS WILL APPEAR IN YOUR ACCOUNT</small>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
