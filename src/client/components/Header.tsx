import type { FormEvent } from "react";
import type { Language } from "../i18n";

type HeaderProps = {
  language: Language;
  query: string;
  searchLabel: string;
  refreshLabel: string;
  placeholder: string;
  refreshing: boolean;
  onLanguageChange(): void;
  onQueryChange(value: string): void;
  onSearch(): void;
  onRefresh(): void;
};

export const Header = (props: HeaderProps) => {
  const submit = (event: FormEvent) => { event.preventDefault(); props.onSearch(); };
  return (
    <>
      <header className="masthead">
        <div><h1>RESEARCH UPDATE</h1><p>{props.language === "zh" ? "你的个人天文学论文桌" : "Your personal astronomy paper desk"}</p></div>
        <button className="language-toggle" onClick={props.onLanguageChange}>{props.language === "zh" ? "EN" : "中文"}</button>
      </header>
      <form className="search-bar" onSubmit={submit}>
        <input type="search" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={props.placeholder} />
        <button type="submit">{props.searchLabel}</button>
        <button type="button" onClick={props.onRefresh} disabled={props.refreshing}>{props.refreshLabel}</button>
      </form>
    </>
  );
};
