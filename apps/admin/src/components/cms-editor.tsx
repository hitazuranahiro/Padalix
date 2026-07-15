"use client";

import { useMemo, useState } from "react";
import type { SiteContent } from "@padalix/content";
import { Check, ExternalLink, FileText, Monitor, Save, Send, Smartphone, Upload } from "lucide-react";

const sections = [
  { id: "hero", index: "01", label: "Hero" },
  { id: "system", index: "02", label: "System" },
  { id: "product", index: "03", label: "Control surface" },
  { id: "infrastructure", index: "04", label: "Infrastructure" },
  { id: "mission", index: "05", label: "Mission" },
  { id: "access", index: "06", label: "Final action" },
  { id: "about", index: "07", label: "About page" },
  { id: "presentation", index: "08", label: "Presentation" },
  { id: "help", index: "09", label: "Help center" },
  { id: "docs", index: "10", label: "Documentation" },
] as const;

type SectionId = typeof sections[number]["id"];
type Field = { label: string; path: string; multiline?: boolean };

const fields: Record<SectionId, Field[]> = {
  hero: [
    { label: "Eyebrow", path: "hero.eyebrow" },
    { label: "Headline line 1", path: "hero.title.0" },
    { label: "Headline line 2", path: "hero.title.1" },
    { label: "Headline line 3", path: "hero.title.2" },
    { label: "Supporting statement", path: "hero.body", multiline: true },
    { label: "Primary action", path: "hero.primaryAction" },
    { label: "Secondary action", path: "hero.secondaryAction" },
  ],
  system: [
    { label: "Eyebrow", path: "system.eyebrow" },
    { label: "Section title", path: "system.title", multiline: true },
    { label: "Section introduction", path: "system.body", multiline: true },
    { label: "Fund step title", path: "system.steps.0.title" },
    { label: "Route step title", path: "system.steps.1.title" },
    { label: "Arrival step title", path: "system.steps.2.title" },
  ],
  product: [
    { label: "Eyebrow", path: "product.eyebrow" },
    { label: "Section title", path: "product.title", multiline: true },
    { label: "Section introduction", path: "product.body", multiline: true },
    { label: "Feature 1", path: "product.features.0" },
    { label: "Feature 2", path: "product.features.1" },
    { label: "Feature 3", path: "product.features.2" },
    { label: "Feature 4", path: "product.features.3" },
  ],
  infrastructure: [
    { label: "Section title", path: "infrastructure.title", multiline: true },
    { label: "Section introduction", path: "infrastructure.body", multiline: true },
    { label: "Interface layer", path: "infrastructure.layers.0.title" },
    { label: "Engine layer", path: "infrastructure.layers.1.title" },
    { label: "Settlement layer", path: "infrastructure.layers.2.title" },
  ],
  mission: [
    { label: "Mission statement", path: "mission.statement", multiline: true },
    { label: "Mission detail", path: "mission.body", multiline: true },
    { label: "Market metric", path: "mission.metric" },
    { label: "Metric label", path: "mission.metricLabel" },
  ],
  access: [
    { label: "Eyebrow", path: "access.eyebrow" },
    { label: "Closing title", path: "access.title", multiline: true },
    { label: "Closing statement", path: "access.body", multiline: true },
    { label: "Action label", path: "access.action" },
    { label: "Footer tagline", path: "footer.tagline" },
  ],
  about: [
    { label: "Eyebrow", path: "about.eyebrow" },
    { label: "Page title", path: "about.title", multiline: true },
    { label: "Introduction", path: "about.introduction", multiline: true },
    { label: "Name section title", path: "about.nameTitle", multiline: true },
    { label: "Name story", path: "about.nameBody", multiline: true },
    { label: "Problem title", path: "about.problemTitle", multiline: true },
    { label: "Problem statement", path: "about.problemBody", multiline: true },
    { label: "Fee metric", path: "about.principles.0.value" },
    { label: "Settlement metric", path: "about.principles.1.value" },
    { label: "Market metric", path: "about.principles.2.value" },
    { label: "Long-term vision", path: "about.vision", multiline: true },
  ],
  presentation: [
    { label: "Eyebrow", path: "presentation.eyebrow" },
    { label: "Presentation title", path: "presentation.title", multiline: true },
    { label: "Introduction", path: "presentation.introduction", multiline: true },
    { label: "Document label", path: "presentation.documentLabel" },
    { label: "Flow 1 title", path: "presentation.flow.0.title" },
    { label: "Flow 1 detail", path: "presentation.flow.0.body", multiline: true },
    { label: "Flow 2 title", path: "presentation.flow.1.title" },
    { label: "Flow 2 detail", path: "presentation.flow.1.body", multiline: true },
    { label: "Flow 3 title", path: "presentation.flow.2.title" },
    { label: "Flow 3 detail", path: "presentation.flow.2.body", multiline: true },
    { label: "Feature 1 title", path: "presentation.features.0.title" },
    { label: "Feature 1 detail", path: "presentation.features.0.body", multiline: true },
    { label: "Feature 2 title", path: "presentation.features.1.title" },
    { label: "Feature 2 detail", path: "presentation.features.1.body", multiline: true },
    { label: "Feature 3 title", path: "presentation.features.2.title" },
    { label: "Feature 3 detail", path: "presentation.features.2.body", multiline: true },
    { label: "Feature 4 title", path: "presentation.features.3.title" },
    { label: "Feature 4 detail", path: "presentation.features.3.body", multiline: true },
    { label: "Feature 5 title", path: "presentation.features.4.title" },
    { label: "Feature 5 detail", path: "presentation.features.4.body", multiline: true },
    { label: "Feature 6 title", path: "presentation.features.5.title" },
    { label: "Feature 6 detail", path: "presentation.features.5.body", multiline: true },
    { label: "Primary market", path: "presentation.markets.0" },
    { label: "Secondary market", path: "presentation.markets.1" },
    { label: "Tertiary market", path: "presentation.markets.2" },
    { label: "Vision title", path: "presentation.visionTitle", multiline: true },
    { label: "Vision detail", path: "presentation.visionBody", multiline: true },
  ],
  help: [
    { label: "Eyebrow", path: "help.eyebrow" },
    { label: "Page title", path: "help.title", multiline: true },
    { label: "Introduction", path: "help.introduction", multiline: true },
    { label: "Support path 1", path: "help.paths.0.title" },
    { label: "Support path 1 detail", path: "help.paths.0.body", multiline: true },
    { label: "Support path 2", path: "help.paths.1.title" },
    { label: "Support path 2 detail", path: "help.paths.1.body", multiline: true },
    { label: "Support path 3", path: "help.paths.2.title" },
    { label: "Support path 3 detail", path: "help.paths.2.body", multiline: true },
    { label: "Support path 4", path: "help.paths.3.title" },
    { label: "Support path 4 detail", path: "help.paths.3.body", multiline: true },
    { label: "FAQ 1 question", path: "help.faq.0.question" },
    { label: "FAQ 1 answer", path: "help.faq.0.answer", multiline: true },
    { label: "FAQ 2 question", path: "help.faq.1.question" },
    { label: "FAQ 2 answer", path: "help.faq.1.answer", multiline: true },
    { label: "Support heading", path: "help.supportTitle" },
    { label: "Support guidance", path: "help.supportBody", multiline: true },
    { label: "Support email", path: "help.supportEmail" },
  ],
  docs: [
    { label: "Eyebrow", path: "docs.eyebrow" },
    { label: "Page title", path: "docs.title", multiline: true },
    { label: "Introduction", path: "docs.introduction", multiline: true },
    { label: "Quickstart 1 title", path: "docs.quickstart.0.title" },
    { label: "Quickstart 1 detail", path: "docs.quickstart.0.body", multiline: true },
    { label: "Quickstart 2 title", path: "docs.quickstart.1.title" },
    { label: "Quickstart 2 detail", path: "docs.quickstart.1.body", multiline: true },
    { label: "Quickstart 3 title", path: "docs.quickstart.2.title" },
    { label: "Quickstart 3 detail", path: "docs.quickstart.2.body", multiline: true },
    { label: "Quickstart 4 title", path: "docs.quickstart.3.title" },
    { label: "Quickstart 4 detail", path: "docs.quickstart.3.body", multiline: true },
    { label: "Wallet guide title", path: "docs.guides.0.title" },
    { label: "Wallet guide summary", path: "docs.guides.0.summary", multiline: true },
    { label: "Transfer guide title", path: "docs.guides.1.title" },
    { label: "Transfer guide summary", path: "docs.guides.1.summary", multiline: true },
    { label: "Distribution guide title", path: "docs.guides.2.title" },
    { label: "Distribution guide summary", path: "docs.guides.2.summary", multiline: true },
    { label: "Claim guide title", path: "docs.guides.3.title" },
    { label: "Claim guide summary", path: "docs.guides.3.summary", multiline: true },
    { label: "Safety heading", path: "docs.safetyTitle", multiline: true },
    { label: "Safety guidance", path: "docs.safetyBody", multiline: true },
  ],
};

function DraftPreview({ active, content }: { active: SectionId; content: SiteContent }) {
  if (active === "hero") return <><small>{content.hero.eyebrow}</small><h2>{content.hero.title.map((line) => <span key={line}>{line}</span>)}</h2><p>{content.hero.body}</p><button type="button">{content.hero.primaryAction}</button></>;
  if (active === "system") return <><small>{content.system.eyebrow}</small><h2>{content.system.title}</h2><p>{content.system.body}</p><div className="preview-items">{content.system.steps.map((step) => <span key={step.index}>{step.index}<strong>{step.title}</strong></span>)}</div></>;
  if (active === "product") return <><small>{content.product.eyebrow}</small><h2>{content.product.title}</h2><p>{content.product.body}</p><div className="preview-items">{content.product.features.map((feature, index) => <span key={feature}>0{index + 1}<strong>{feature}</strong></span>)}</div></>;
  if (active === "infrastructure") return <><small>04 / INFRASTRUCTURE</small><h2>{content.infrastructure.title}</h2><p>{content.infrastructure.body}</p><div className="preview-items">{content.infrastructure.layers.map((layer) => <span key={layer.label}>{layer.label}<strong>{layer.title}</strong></span>)}</div></>;
  if (active === "mission") return <><small>05 / WHY PADALIX</small><h2>{content.mission.statement}</h2><p>{content.mission.body}</p><div className="preview-metric"><strong>{content.mission.metric}</strong><span>{content.mission.metricLabel}</span></div></>;
  if (active === "access") return <><small>{content.access.eyebrow}</small><h2>{content.access.title}</h2><p>{content.access.body}</p><button type="button">{content.access.action}</button></>;
  if (active === "about") return <><small>{content.about.eyebrow}</small><h2>{content.about.title}</h2><p>{content.about.introduction}</p><div className="preview-items"><span>PADALA<strong>TO SEND / REMITTANCE</strong></span><span>IX<strong>INFRASTRUCTURE EXCHANGE</strong></span></div></>;
  if (active === "presentation") return <><small>{content.presentation.eyebrow}</small><h2>{content.presentation.title}</h2><p>{content.presentation.introduction}</p><div className="preview-items">{content.presentation.features.slice(0, 3).map((feature, index) => <span key={feature.title}>0{index + 1}<strong>{feature.title}</strong></span>)}</div></>;
  if (active === "help") return <><small>{content.help.eyebrow}</small><h2>{content.help.title}</h2><p>{content.help.introduction}</p><div className="preview-items">{content.help.paths.slice(0, 3).map((path, index) => <span key={path.title}>0{index + 1}<strong>{path.title}</strong></span>)}</div></>;
  return <><small>{content.docs.eyebrow}</small><h2>{content.docs.title}</h2><p>{content.docs.introduction}</p><div className="preview-items">{content.docs.quickstart.slice(0, 3).map((step) => <span key={step.index}>{step.index}<strong>{step.title}</strong></span>)}</div></>;
}

function readPath(source: SiteContent, path: string) {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], source) as string;
}

function writePath(source: SiteContent, path: string, value: string): SiteContent {
  const next = structuredClone(source) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let target = next;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
  return next as unknown as SiteContent;
}

export function CmsEditor({ initialContent, publishedAt }: { initialContent: SiteContent; publishedAt: string | null }) {
  const [content, setContent] = useState(initialContent);
  const [active, setActive] = useState<SectionId>("hero");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "published">("saved");
  const [uploadState, setUploadState] = useState("PDF / READY FOR UPLOAD");
  const activeSection = useMemo(() => sections.find((section) => section.id === active)!, [active]);

  async function persist(publish: boolean) {
    setState("saving");
    const response = await fetch("/api/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, publish }) });
    if (!response.ok) { setState("dirty"); return; }
    setState(publish ? "published" : "saved");
  }

  return <div className="cms-workspace">
    <aside className="cms-navigation"><p>SITE CONTENT</p><nav aria-label="Website sections">{sections.map((section) => <button className={active === section.id ? "active" : ""} type="button" key={section.id} onClick={() => setActive(section.id)}><span>{section.index}</span><strong>{section.label}</strong></button>)}</nav><div className="cms-navigation-footer"><span>LAST PUBLISHED</span><strong>{publishedAt ? new Date(publishedAt).toLocaleString() : "NOT YET PUBLISHED"}</strong><a href={process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000"} target="_blank" rel="noreferrer">VIEW WEBSITE <ExternalLink size={14} /></a></div></aside>

    <section className="content-editor"><header><div><p>CONTENT WORKSPACE / {activeSection.index}</p><h1>{activeSection.label}</h1></div><span className={`document-state ${state}`}><i />{state.toUpperCase()}</span></header><div className="editor-fields">{fields[active].map((field) => <label key={field.path}><span>{field.label}</span>{field.multiline ? <textarea rows={3} value={readPath(content, field.path)} onChange={(event) => { setContent(writePath(content, field.path, event.target.value)); setState("dirty"); }} /> : <input value={readPath(content, field.path)} onChange={(event) => { setContent(writePath(content, field.path, event.target.value)); setState("dirty"); }} />}</label>)}{active === "presentation" && <div className="pdf-upload"><div><FileText size={20} /><span><strong>PRESENTATION PDF</strong><small>{uploadState}</small></span></div><label className="upload-command"><Upload size={16} /> UPLOAD PDF<input type="file" accept="application/pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploadState("UPLOADING / " + file.name); const form = new FormData(); form.set("file", file); const response = await fetch("/api/assets/presentation", { method: "PUT", body: form }); const result = await response.json() as { url?: string; error?: string }; if (!response.ok || !result.url) { setUploadState(result.error ?? "UPLOAD FAILED"); return; } setContent(writePath(content, "presentation.documentUrl", result.url)); setUploadState("UPLOADED / PUBLISH TO APPLY"); setState("dirty"); }} /></label></div>}</div></section>

    <aside className="cms-preview"><header><div><span>LIVE DRAFT / {activeSection.index}</span><strong>{device.toUpperCase()} PREVIEW</strong></div><div className="device-control"><button className={device === "desktop" ? "active" : ""} type="button" title="Desktop preview" aria-label="Desktop preview" onClick={() => setDevice("desktop")}><Monitor size={16} /></button><button className={device === "mobile" ? "active" : ""} type="button" title="Mobile preview" aria-label="Mobile preview" onClick={() => setDevice("mobile")}><Smartphone size={16} /></button></div></header><div className={`preview-frame ${device}`}><div className={`preview-site preview-${active}`}><div className="preview-nav"><b>PADALIX</b><span>ABOUT&nbsp;&nbsp; PRESENTATION&nbsp;&nbsp; APP</span></div><div className="preview-content"><DraftPreview active={active} content={content} /></div><div className="preview-signal"><Check size={14} /> {active.toUpperCase()} / DRAFT</div></div></div><footer><button className="save-command" type="button" disabled={state === "saving"} onClick={() => persist(false)}><Save size={17} /> SAVE DRAFT</button><button className="publish-command" type="button" disabled={state === "saving"} onClick={() => persist(true)}><Send size={17} /> PUBLISH</button></footer></aside>
  </div>;
}
