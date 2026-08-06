const SettingsNotice = ({ result }) => result ? (
  <div className={`notice notice--${result.status}`} role={result.status === "danger" ? "alert" : "status"}>
    <span>{result.text}</span>
    {result.fileLink ? <a href={result.fileLink} target="_blank" rel="noopener">Buka file di Google Drive</a> : null}
  </div>
) : null;

export default SettingsNotice;
