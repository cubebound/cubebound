"use client";

import { useRef } from "react";

import {
  createCubeFromListAction,
  previewImportListAction,
  type ImportCommitRow,
} from "@/app/cube/actions";
import { CubeFields } from "@/app/cubes/cube-form";
import ImportCards from "@/components/import-cards";

/**
 * "Paste a list": the cube's details, then the importer, and the cube is
 * created only when the list is confirmed.
 *
 * The details are an ordinary form with no submit of its own, read through
 * `FormData` at commit time, so they stay uncontrolled fields exactly like the
 * other starting points and the settings page. The server validates them
 * again; nothing here is trusted.
 */
export default function NewCubeFromList() {
  const detailsRef = useRef<HTMLFormElement>(null);

  function commit(rows: ImportCommitRow[]) {
    const details = new FormData(detailsRef.current ?? undefined);
    return createCubeFromListAction(
      {
        name: details.get("name"),
        description: details.get("description"),
        visibility: details.get("visibility"),
      },
      rows,
    );
  }

  return (
    <div className="space-y-8">
      <form
        ref={detailsRef}
        className="max-w-lg space-y-4"
        // Enter in the name field would otherwise submit this form to itself.
        onSubmit={(event) => event.preventDefault()}
      >
        <CubeFields />
      </form>
      <ImportCards
        preview={previewImportListAction}
        commit={commit}
        target={{ kind: "new" }}
      />
    </div>
  );
}
