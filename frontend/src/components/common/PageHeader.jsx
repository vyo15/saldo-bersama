import PageInfoButton from "./PageInfoButton.jsx";

const normalizedHelp = (help, title) => {
  if (!help) return null;
  if (typeof help === "string") return { title: `Tentang ${title}`, content: help };
  return { title: help.title || `Tentang ${title}`, content: help.content || help.description || "" };
};

const PageHeader = ({ eyebrow, title, description, actions, help }) => {
  const helpContent = normalizedHelp(help, title);
  return (
    <header className={`page-header${helpContent ? " page-header--with-help" : ""}`}>
      <div className="page-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="page-header__title-row">
          <h1>{title}</h1>
          {helpContent ? <PageInfoButton title={helpContent.title}>{helpContent.content}</PageInfoButton> : null}
        </div>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
};

export default PageHeader;
