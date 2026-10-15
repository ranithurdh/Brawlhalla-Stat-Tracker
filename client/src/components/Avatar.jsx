// A player's face, or their first letter when no face has been added.
export default function Avatar({ name, face, size = 44, className = "" }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (face) {
    return <img className={`avatar ${className}`} style={style} src={face} alt={`${name}'s face`} />;
  }
  return (
    <span className={`avatar fallback ${className}`} style={style} aria-hidden="true">
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
