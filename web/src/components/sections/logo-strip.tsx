const placeholderBrands = [
  "Northstar",
  "Luma",
  "Arcadia",
  "Vela",
  "Meridian",
];

export function LogoStrip() {
  return (
    <section aria-label="Companies using Sochestral" className="logo-strip">
      <ul className="logo-grid" role="list">
        {placeholderBrands.map((brand) => (
          <li key={brand} aria-label={`${brand} placeholder logo`}>
            <span className="logo-mark" aria-hidden="true">
              {brand}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
