
export default function PageNavigation({ hasResults }: { hasResults: boolean }) {
  const links = [
    ["inicio", "Inicio"],
    ["parametros", "Configuraci\u00f3n"],
    ["telemetria", "Telemetr\u00eda"],
    ["resultados", "Resultados"],
    ...(hasResults ? [["usos-bateria", "Posibles usos"], ["grafica", "Gr\u00e1fica"]] : []),
    ["metodologia", "Conoce cómo funciona"],
  ];
  return <header className="app-header page-navigation">
    <a className="brand" href="#inicio" aria-label="BaterIA, ir al inicio"><img className="brand-mark" src="/brand-logo.svg" alt="" width="44" height="44" /><span>Bater<span className="brand-ai">IA</span><small>Salud y segunda vida</small></span></a>
    <nav aria-label="Paneles de la página">{links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
  </header>;
}
