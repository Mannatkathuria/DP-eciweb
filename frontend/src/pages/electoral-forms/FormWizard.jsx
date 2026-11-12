import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { tr } from "../../i18n";
import useGeography from "../../hooks/useGeography";
import { preflightDocument, typeNames } from "../../preflight";
import PreflightNotes from "../../components/PreflightNotes";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const EMPTY = (v) => v === undefined || v === null || v === "";
const toOptions = (options = []) => options.map((o) => typeof o === "string" ? { value: o, label: o } : o);

function fieldIsVisible(field, values, files) {
  return !field.when || field.when(values, files);
}

function FieldControl({ field, values, files, errors, setValue, setFile }) {
  const id = `ef-${field.name}`;
  const error = errors[field.name];
  const value = values[field.name];
  const required = Boolean(field.required);
  const common = {
    id,
    name: field.name,
    "aria-required": required || undefined,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined,
  };

  const shell = (control) => (
    <div className={`f6-field${field.wide ? " f6-wide" : ""}`}>
      <label htmlFor={id}>
        {field.label}{required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}
      </label>
      {control}
      {field.hint && <p id={`${id}-hint`} className="f6-hint">{field.hint}</p>}
      {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
    </div>
  );

  if (field.type === "radio") {
    return (
      <fieldset className="f6-field f6-wide f6-choice" aria-invalid={error ? "true" : undefined}>
        <legend>{field.label}{required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}</legend>
        {field.hint && <p className="f6-hint">{field.hint}</p>}
        <div className={`f6-options${field.columns ? " f6-options-cols" : ""}`}>
          {toOptions(field.options).map((option, index) => (
            <label key={option.value} className={`f6-option${value === option.value ? " is-selected" : ""}`}>
              <input type="radio" name={field.name} value={option.value} checked={value === option.value}
                onChange={() => setValue(field.name, option.value)} required={required && index === 0} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {error && <p className="f6-error" role="alert">{error}</p>}
      </fieldset>
    );
  }

  if (field.type === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="f6-field f6-wide f6-choice" aria-invalid={error ? "true" : undefined}>
        <legend>{field.label}{required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}</legend>
        {field.hint && <p className="f6-hint">{field.hint}</p>}
        <div className={`f6-options${field.columns ? " f6-options-cols" : ""}`}>
          {toOptions(field.options).map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label key={option.value} className={`f6-option${checked ? " is-selected" : ""}`}>
                <input id={option.value === toOptions(field.options)[0]?.value ? id : undefined} type="checkbox" checked={checked} onChange={() => setValue(field.name,
                  checked ? selected.filter((x) => x !== option.value) : [...selected, option.value])} />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {error && <p className="f6-error" role="alert">{error}</p>}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className={`f6-field f6-wide${error ? " has-error" : ""}`}>
        <label className={`f6-check${value ? " is-selected" : ""}`} htmlFor={id}>
          <input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(field.name, event.target.checked)} />
          <span>{field.label}{required ? <span className="f6-req" aria-hidden="true"> *</span> : ""}</span>
        </label>
        {field.hint && <p id={`${id}-hint`} className="f6-hint">{field.hint}</p>}
        {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
      </div>
    );
  }

  if (field.type === "file") {
    const file = files[field.name];
    const accepted = (field.accept || "image/jpeg,image/png,application/pdf").split(",").map((x) => x.trim());
    const maxBytes = field.maxBytes || MAX_FILE_BYTES;
    const choose = async (event) => {
      const input = event.target;
      const selectedFile = input.files?.[0];
      input.value = "";
      if (!selectedFile) return;
      try {
        const checked = await preflightDocument(selectedFile, { types: accepted, maxBytes, label: field.label });
        setFile(field.name, { dataUrl: checked.dataUrl, fileName: selectedFile.name, size: selectedFile.size, mimeType: checked.mimeType, warnings: checked.warnings });
      } catch (err) {
        setFile(field.name, null, err.message);
      }
    };
    return (
      <div className={`f6-field f6-wide${error ? " has-error" : ""}`}>
        <span className="f6-label" id={`${id}-label`}>
          {field.label}{required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}
        </span>
        {field.hint && <p className="f6-hint">{field.hint}</p>}
        <div className={`f6-upload${error ? " has-error" : ""}`}>
          {file ? (
            <div className="f6-upload-file">
              {file.mimeType?.startsWith("image/") && <img src={file.dataUrl} alt={`Preview of ${field.label}`} className="f6-upload-preview" />}
              <div><strong className="f6-upload-name">{file.fileName}</strong><span className="f6-upload-status">✓ Attached · {formatSize(file.size)}</span></div>
            </div>
          ) : <p className="f6-upload-empty">No file attached yet.</p>}
          {file?.warnings?.length > 0 && <PreflightNotes warnings={file.warnings} />}
          <div className="f6-upload-actions">
            <input type="file" id={id} className="f6-visually-hidden" accept={field.accept || "image/jpeg,image/png,application/pdf"}
              onChange={choose} aria-labelledby={`${id}-label ${id}-button`} />
            <label htmlFor={id} id={`${id}-button`} className="f6-btn f6-btn-secondary">{file ? "Replace file" : "Choose file"}</label>
            {file && <button type="button" className="f6-btn f6-btn-text" onClick={() => setFile(field.name, null)}>Remove</button>}
          </div>
          <p className="f6-hint">Accepted: {typeNames(accepted)}. Maximum {Math.round(maxBytes / (1024 * 1024))} MB. Each file is checked for damage, blur and size before it is attached.</p>
        </div>
        {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
      </div>
    );
  }

  if (field.type === "select") {
    return shell(
      <select {...common} value={value ?? ""} onChange={(event) => setValue(field.name, event.target.value)}>
        <option value="">{field.placeholder || "Select an option"}</option>
        {toOptions(field.options).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === "textarea") {
    return shell(<textarea {...common} rows={field.rows || 3} maxLength={field.maxLength} value={value ?? ""}
      placeholder={field.placeholder || ""} onChange={(event) => setValue(field.name, event.target.value)} />);
  }

  return shell(
    <input {...common} type={field.type || "text"} value={value ?? ""} min={field.min} max={field.max}
      maxLength={field.maxLength} inputMode={field.inputMode} placeholder={field.placeholder || ""}
      autoComplete={field.autoComplete} onChange={(event) => setValue(field.name, field.uppercase ? event.target.value.toUpperCase() : event.target.value)} />
  );
}

function formatSize(bytes = 0) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function flattenSections(sections, values, files) {
  return sections.flatMap((section) => (section.fields || []).filter((field) => fieldIsVisible(field, values, files)));
}

function validateFields(fields, values, files) {
  const found = {};
  for (const field of fields) {
    const value = field.type === "file" ? files[field.name] : values[field.name];
    if (field.required) {
      const missing = field.type === "file" ? !value
        : field.type === "checkbox" ? value !== true
          : field.type === "multi" ? !Array.isArray(value) || value.length === 0
            : typeof value === "string" ? !value.trim() : EMPTY(value);
      if (missing) {
        found[field.name] = field.requiredMessage || tr("Complete {{field}}.", { field: tr(field.label).toLowerCase() });
        continue;
      }
    }
    if (!found[field.name] && field.type === "number" && !EMPTY(value)) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) found[field.name] = tr("Enter a valid number for {{field}}.", { field: tr(field.label).toLowerCase() });
      else if (field.min !== undefined && numericValue < Number(field.min)) found[field.name] = tr("Enter a value of at least {{min}}.", { min: field.min });
      else if (field.max !== undefined && numericValue > Number(field.max)) found[field.name] = tr("Enter a value no greater than {{max}}.", { max: field.max });
    }
    if (!found[field.name] && field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim())) {
      found[field.name] = "Enter a valid email address.";
    }
    if (!found[field.name] && field.type === "tel" && value && !/^[6-9]\d{9}$/.test(String(value).trim())) {
      found[field.name] = "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
    }
    if (!found[field.name] && field.validate) {
      const message = field.validate(value, values, files);
      if (message) found[field.name] = message;
    }
  }
  return found;
}

function reviewValue(field, values, files) {
  const value = field.type === "file" ? files[field.name] : values[field.name];
  if (field.type === "file") return value ? `Attached: ${value.fileName}` : "Not attached";
  if (field.type === "checkbox") return value ? "Confirmed" : "Not confirmed";
  if (Array.isArray(value)) return value.length ? value.map((item) => toOptions(field.options).find((o) => o.value === item)?.label || item).join(", ") : "—";
  if (EMPTY(value)) return "—";
  if (field.sensitive) {
    const s = String(value);
    return s.length > 4 ? `${"•".repeat(Math.max(4, s.length - 4))}${s.slice(-4)}` : "••••";
  }
  if (field.type === "select" || field.type === "radio") {
    return toOptions(field.options).find((o) => o.value === value)?.label || value;
  }
  return value;
}

// Every form is addressed to the Electoral Registration Officer of one assembly constituency
// (chosen from the ECI list). The backend routes it to that constituency's BLO and ERO.
const ERO_FIELDS = ["eroState", "eroDistrict", "eroConstituency"];

export default function FormWizard({ config }) {
  const navigate = useNavigate();
  const { geography, states, districtsOf, constituenciesOf } = useGeography();
  const baseValues = useMemo(() => ({ eroState: "", eroDistrict: "", eroConstituency: "", ...config.initialValues }), [config]);
  const [values, setValues] = useState(() => ({ ...baseValues }));
  const [files, setFiles] = useState({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  // A saved draft (answers and stage, never files) lets the applicant come back later.
  const draftKey = `draft:${config.code}`;
  const formName = config.code.replace(/^FORM_/, "Form ");
  const [draft, setDraft] = useState(() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; } });
  // One key per attempt: a retry after a network failure is recognised and not filed twice.
  const attemptKey = useRef(null);
  const steps = useMemo(() => [{
    title: "Addressed to",
    sections: (v) => [{
      title: "Electoral Registration Officer of",
      intro: config.code === "FORM_8"
        ? "Choose the constituency of your entry. For a shift of residence, choose the constituency you have moved to: its ERO decides the application."
        : "Choose the assembly constituency where the entry is, or is to be, made. The application goes to the BLO and ERO of that constituency.",
      fields: [
        { type: "select", name: "eroState", label: "State / UT", required: true, options: states.map((x) => x.name), placeholder: geography ? "Select a State / UT" : "Loading…" },
        { type: "select", name: "eroDistrict", label: "District", required: true, options: districtsOf(v.eroState).map((d) => d.name) },
        { type: "select", name: "eroConstituency", label: "Assembly constituency", required: true, options: constituenciesOf(v.eroState, v.eroDistrict) },
      ],
    }],
  }, ...config.steps], [config, geography, states, districtsOf, constituenciesOf]);
  const isReview = step === steps.length;
  const currentStep = steps[step];
  const sections = isReview ? [] : currentStep.sections(values, files);
  const currentFields = flattenSections(sections, values, files);
  const dirty = !submitted && (JSON.stringify(values) !== JSON.stringify(baseValues) || Object.keys(files).length > 0);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    attemptKey.current = null;
    if (!dirty || draft) return undefined;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ values: Object.fromEntries(Object.entries(values).filter(([k]) => !/aadhaar|password|pin$/i.test(k))), step, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ } }, 600);
    return () => clearTimeout(t);
  }, [values, files, step, dirty, draft, draftKey]);
  const dropDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } setDraft(null); };
  const resume = () => { setValues({ ...baseValues, ...draft.values }); setStep(Math.min(draft.step ?? 0, steps.length)); setDraft(null); };

  useEffect(() => {
    document.getElementById("ef-stage-heading")?.focus();
    document.getElementById("ef-form-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  const setValue = (name, value) => {
    setValues((previous) => ({
      ...previous, [name]: value,
      ...(name === "eroState" ? { eroDistrict: "", eroConstituency: "" } : name === "eroDistrict" ? { eroConstituency: "" } : {}),
    }));
    setErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const setFile = (name, file, fileError = "") => {
    setFiles((previous) => {
      const next = { ...previous };
      if (file) next[name] = file;
      else delete next[name];
      return next;
    });
    setErrors((previous) => {
      const next = { ...previous };
      if (fileError) next[name] = fileError;
      else delete next[name];
      return next;
    });
  };

  const sectionsForStep = (index) => flattenSections(steps[index].sections(values, files), values, files);
  const validateStep = (index) => {
    const found = validateFields(sectionsForStep(index), values, files);
    if (steps[index].validate) Object.assign(found, steps[index].validate(values, files) || {});
    return found;
  };

  const next = () => {
    const found = validateStep(step);
    if (Object.keys(found).length) {
      setErrors(found);
      setTimeout(() => document.getElementById(`ef-${Object.keys(found)[0]}`)?.focus(), 0);
      return;
    }
    setErrors({});
    setError("");
    setStep((current) => Math.min(current + 1, steps.length));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    for (let index = 0; index < steps.length; index += 1) {
      const found = validateStep(index);
      if (Object.keys(found).length) {
        setStep(index);
        setErrors(found);
        setTimeout(() => document.getElementById(`ef-${Object.keys(found)[0]}`)?.focus(), 50);
        return;
      }
    }
    setLoading(true);
    setError("");
    // Only include currently visible fields/files. This prevents stale answers from a
    // previously selected Form 8 request type being sent after the applicant changes it.
    const activeFields = steps.flatMap((_, index) => sectionsForStep(index));
    const activeValueNames = new Set(activeFields.filter((field) => field.type !== "file").map((field) => field.name));
    const activeFileNames = new Set(activeFields.filter((field) => field.type === "file").map((field) => field.name));
    const application = Object.fromEntries(Object.entries(values).filter(([key]) => activeValueNames.has(key) && !ERO_FIELDS.includes(key)));
    const jurisdiction = { state: values.eroState, district: values.eroDistrict, constituency: values.eroConstituency };
    const documents = Object.fromEntries(Object.entries(files)
      .filter(([key]) => activeFileNames.has(key))
      .map(([key, file]) => [key, {
        dataUrl: file.dataUrl, fileName: file.fileName, mimeType: file.mimeType,
      }]));
    try {
      attemptKey.current ??= crypto.randomUUID();
      const response = await api.post(config.endpoint, {
        formCode: config.code,
        jurisdiction,
        application,
        documents,
      }, { headers: { "Idempotency-Key": attemptKey.current } });
      const data = response.data?.data || response.data || {};
      setSubmitted({
        referenceId: data.referenceId || data.applicationId || data.acknowledgementNumber || "Submitted",
        message: response.data?.message || data.message || "Your application has been received.",
        at: new Date(),
        office: `ERO, ${values.eroConstituency}, ${values.eroDistrict}, ${values.eroState}`,
        documents: Object.values(documents).map((d) => d.fileName),
      });
      dropDraft();
    } catch (err) {
      setError(err.response?.data?.message || (err.response
        ? tr("The server rejected this request ({{status}}).", { status: err.response.status })
        : "Could not reach the server. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  const allReviewSections = steps.map((item, index) => ({
    title: item.title,
    sections: item.sections(values, files),
    index,
  }));
  const missing = isReview ? steps.map((item, index) => ({ index, title: item.title, problems: Object.values(validateStep(index)) })).filter((x) => x.problems.length) : [];
  const printReceipt = () => {
    document.body.classList.add("printing-receipt");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-receipt"), { once: true });
    window.print();
  };
  const progress = Math.round(((step + 1) / (steps.length + 1)) * 100);

  return (
    <>
      <div className="container">
        <p className="crumb-line"><Link to="/home">Home</Link> / <Link to="/voters">Voter Mitra</Link> / <span>{formName}</span></p>
      </div>
      <main className="portal-page f6-page">
        <section className="portal-card portal-wide f6-card" id="ef-form-card">
          <p className="eyebrow">Election Commission of India · {formName}</p>
          <h1>{config.title}</h1>
          <p className="portal-muted f6-intro">{config.intro}</p>
          <p className="f6-legend-note">Fields marked <span className="f6-req">*</span> are required. Optional fields may be left blank.</p>

          {submitted && (
            <div className="f6-alert f6-alert-ok f6-submitted" role="status">
              <h2>✓ Application submitted</h2>
              <p>{submitted.message}</p>
              <dl className="facts f6-receipt">
                <dt>Reference number</dt><dd className="f6-ref">{submitted.referenceId}</dd>
                <dt>Form</dt><dd>{formName}: {config.title}</dd>
                <dt>Submitted</dt><dd>{submitted.at.toLocaleString("en-IN")}</dd>
                <dt>Addressed to</dt><dd>{submitted.office}</dd>
                {submitted.documents.length > 0 && <><dt>Documents</dt><dd>{submitted.documents.join(", ")}</dd></>}
              </dl>
              <p className="no-print" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="f6-btn f6-btn-secondary" onClick={printReceipt}>Print or save receipt</button>
                <Link to={`/check-request?ref=${encodeURIComponent(submitted.referenceId)}`}>Track this application</Link>
              </p>
            </div>
          )}

          {draft && !submitted && (
            <div className="f6-draft" role="status">
              <span>You have a saved draft from {new Date(draft.savedAt).toLocaleString("en-IN")}. Attached files are not saved and must be added again.</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="button" className="f6-btn f6-btn-primary f6-btn-small" onClick={resume}>Resume</button>
                <button type="button" className="f6-btn f6-btn-text" onClick={dropDraft}>Start again</button>
              </span>
            </div>
          )}

          <nav aria-label={`${formName} stages`} className="f6-progress">
            <p className="f6-progress-label" id="ef-progress-label">
              {isReview ? "Review and submit" : tr("Stage {{n}} of {{total}}:", { n: step + 1, total: steps.length + 1 }) + " "}
              <strong>{isReview ? "Review and submit" : currentStep.title}</strong>
            </p>
            <div className="f6-bar" role="progressbar" aria-labelledby="ef-progress-label" aria-valuemin={1}
              aria-valuemax={steps.length + 1} aria-valuenow={step + 1}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <ol className="f6-steps">
              {[...steps.map((s) => s.title), "Review"].map((label, index) => (
                <li key={`${label}-${index}`} className={index === step ? "is-current" : index < step ? "is-done" : ""}
                  aria-current={index === step ? "step" : undefined}>
                  <span className="f6-step-num" aria-hidden="true">{index < step ? "✓" : index + 1}</span>
                  <span className="f6-step-title">{label}</span>
                </li>
              ))}
            </ol>
          </nav>

          <form onSubmit={isReview ? submit : (event) => { event.preventDefault(); next(); }} noValidate className="f6-form">
            <h2 className="f6-stage-title" id="ef-stage-heading" tabIndex={-1}>
              {isReview ? "Review and submit" : `${step + 1}. ${currentStep.title}`}
            </h2>

            {isReview ? (
              <>
                {missing.length > 0 ? (
                  <div className="f6-missing" role="alert">
                    <strong>Still needed before you can submit</strong>
                    <ul>{missing.map((m) => <li key={m.index}><button type="button" className="link-button" onClick={() => { setErrors(validateStep(m.index)); setStep(m.index); }}>{m.title}</button>: {m.problems.join(" ")}</li>)}</ul>
                  </div>
                ) : <div className="f6-note">Everything required is filled in. Check the details below: only the fields and files shown here are sent.</div>}
                {allReviewSections.map((reviewSection) => (
                  <section className="f6-review" key={reviewSection.index}>
                    <div className="f6-review-head">
                      <h3>{reviewSection.index + 1}. {reviewSection.title}</h3>
                      <button type="button" className="f6-btn f6-btn-secondary f6-btn-small" onClick={() => { setErrors({}); setStep(reviewSection.index); }}>Edit</button>
                    </div>
                    {reviewSection.sections.map((group, groupIndex) => (
                      <div key={`${group.title}-${groupIndex}`}>
                        <h4>{group.title}</h4>
                        <dl>
                          {group.fields.filter((field) => fieldIsVisible(field, values, files)).map((field) => (
                            <div className="f6-review-row" key={field.name}>
                              <dt>{field.label}</dt>
                              <dd>{reviewValue(field, values, files)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </section>
                ))}
                {error && <div className="f6-alert f6-alert-error" role="alert">{error}</div>}
              </>
            ) : (
              <>
                {sections.map((section, index) => (
                  <section className="f6-group" key={`${section.title}-${index}`}>
                    <h3>{section.title}</h3>
                    {section.intro && <p className="f6-group-intro">{section.intro}</p>}
                    <div className="f6-grid">
                      {section.fields.filter((field) => fieldIsVisible(field, values, files)).map((field) => (
                        <FieldControl key={field.name} field={field} values={values} files={files} errors={errors}
                          setValue={setValue} setFile={setFile} />
                      ))}
                    </div>
                  </section>
                ))}
                {error && <div className="f6-alert f6-alert-error" role="alert">{error}</div>}
              </>
            )}

            <div className="f6-nav">
              <button type="button" className="f6-btn f6-btn-secondary" disabled={loading}
                onClick={() => { setErrors({}); setError(""); if (step > 0) setStep((current) => current - 1); else navigate(-1); }}>
                ← Back
              </button>
              {isReview ? (
                <button type="submit" className="f6-btn f6-btn-primary" disabled={loading || Boolean(submitted)} aria-busy={loading || undefined}>
                  {loading ? "Submitting…" : submitted ? "Submitted" : "Submit application"}
                </button>
              ) : <button type="submit" className="f6-btn f6-btn-primary">Next →</button>}
            </div>
            {!isReview && !submitted && <p className="f6-hint f6-memory-note">Your answers are saved as a draft on this device as you type, so you can come back to them. Attached files are not saved.</p>}
          </form>
        </section>
      </main>
    </>
  );
}
