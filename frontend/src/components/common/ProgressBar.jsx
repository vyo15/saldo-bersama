const ProgressBar = ({ value, max, label }) => {
  const percentage = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div className="progress" aria-label={`${label}: ${percentage}%`}>
      <div className="progress__track"><span style={{ width: `${percentage}%` }} /></div>
      <span>{percentage}%</span>
    </div>
  );
};

export default ProgressBar;
