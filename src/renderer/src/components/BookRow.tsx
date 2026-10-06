import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Book } from "../model";

function Edit({
  value,
  label,
  onCommit,
  disabled,
}: {
  value: string;
  label: string;
  onCommit: (s: string, recordHistory: boolean) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const started = useRef(false);
  const initial = useRef(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="cell-input"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onFocus={() => {
        started.current = false;
        initial.current = value;
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(e.target.value, !started.current);
        started.current = true;
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(initial.current);
          onCommit(initial.current, false);
        }
      }}
    />
  );
}
export default function BookRow({
  book,
  selected,
  modified,
  disabled,
  select,
  edit,
}: {
  book: Book;
  selected: boolean;
  modified: boolean;
  disabled: boolean;
  select: (shift: boolean) => void;
  edit: (
    field: "series" | "seriesIndex",
    value: string,
    recordHistory: boolean,
  ) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.filePath, disabled });
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className={selected ? "selected" : ""}
      data-testid="book-row"
      onContextMenu={(e) => {
        e.preventDefault();
        if (!selected) select(false);
      }}
    >
      <td>
        <input
          type="checkbox"
          aria-label={`${t("selectBook")} ${book.fileName}`}
          checked={selected}
          disabled={disabled}
          onChange={() => {}}
          onClick={(e) => select(e.shiftKey)}
        />
      </td>
      <td>
        <button
          className="drag icon-button"
          aria-label={`${t("drag")} ${book.fileName}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td title={book.relativePath} onClick={(e) => select(e.shiftKey)}>
        <div className="filename">
          <BookOpen size={16} />
          <span>{book.fileName}</span>
        </div>
      </td>
      <td title={`${book.title}\n${book.author}`}>
        <span className="truncate">{book.title || "—"}</span>
      </td>
      <td>
        <Edit
          value={book.series}
          label={`${t("series")} ${book.fileName}`}
          disabled={disabled}
          onCommit={(v, recordHistory) => edit("series", v, recordHistory)}
        />
      </td>
      <td>
        <Edit
          value={book.seriesIndex}
          label={`${t("index")} ${book.fileName}`}
          disabled={disabled}
          onCommit={(v, recordHistory) => edit("seriesIndex", v, recordHistory)}
        />
      </td>
      <td>
        <span
          className={modified ? "dot modified" : "dot"}
          title={modified ? t("changed") : t("unchanged")}
        />
      </td>
    </tr>
  );
}
