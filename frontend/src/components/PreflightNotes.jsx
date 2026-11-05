// What the document check found about an attached file. The file is attached; these are advice.
export default function PreflightNotes({ warnings }) {
  return (
    <div className="f6-preflight" role="status">
      <strong>Check this file before you submit:</strong>
      <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      <span>You can keep it, or replace it with a clearer copy.</span>
    </div>
  );
}
