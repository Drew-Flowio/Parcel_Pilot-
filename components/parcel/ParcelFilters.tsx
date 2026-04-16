"use client";

import React from "react";
import type { ContactStatus, ParcelFilters, VacancyStatus } from "@/lib/types";
import { Button, Checkbox, Input, Label, Select } from "@/components/ui/Primitives";

const VACANCY_OPTIONS: { id: VacancyStatus; label: string }[] = [
  { id: "vacant_long", label: "Long vacant" },
  { id: "partially_vacant", label: "Partially vacant" },
  { id: "occupied", label: "Occupied" },
  { id: "unknown", label: "Unknown" },
];

const CONTACT_OPTIONS: { id: ContactStatus; label: string }[] = [
  { id: "not_contacted", label: "Not contacted" },
  { id: "contacted", label: "Contacted" },
  { id: "follow_up", label: "Follow up" },
  { id: "do_not_contact", label: "Do not contact" },
];

export function ParcelFiltersForm({
  filters,
  onChange,
  onReset,
  showActions = true,
}: {
  filters: ParcelFilters;
  onChange: (next: Partial<ParcelFilters>) => void;
  onReset: () => void;
  showActions?: boolean;
}) {
  const toggleVacancy = (v: VacancyStatus) => {
    const cur = filters.vacancy ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onChange({ vacancy: next.length ? next : undefined });
  };
  const toggleContact = (c: ContactStatus) => {
    const cur = filters.contactStatus ?? [];
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    onChange({ contactStatus: next.length ? next : undefined });
  };

  return (
    <div className="space-y-5">
      {showActions ? (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Filters</h2>
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-ink-500 hover:text-accent-600"
          >
            Reset
          </button>
        </div>
      ) : null}

      <div>
        <Label>Market value (USD)</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minValue ?? ""}
            onChange={(e) =>
              onChange({
                minValue: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          <span className="text-ink-400">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxValue ?? ""}
            onChange={(e) =>
              onChange({
                maxValue: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>

      <div>
        <Label>Unit count</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minUnits ?? ""}
            onChange={(e) =>
              onChange({
                minUnits: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          <span className="text-ink-400">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxUnits ?? ""}
            onChange={(e) =>
              onChange({
                maxUnits: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>

      <div>
        <Label>Owner</Label>
        <Select
          className="mt-1.5"
          value={filters.absentee ?? "all"}
          onChange={(e) =>
            onChange({ absentee: e.target.value as ParcelFilters["absentee"] })
          }
        >
          <option value="all">All owners</option>
          <option value="only">Only absentee</option>
          <option value="owner_occupied">Owner-occupied only</option>
        </Select>
      </div>

      <div>
        <Label>Vacancy</Label>
        <div className="mt-2 space-y-1.5">
          {VACANCY_OPTIONS.map((v) => (
            <Checkbox
              key={v.id}
              label={v.label}
              checked={filters.vacancy?.includes(v.id) ?? false}
              onChange={() => toggleVacancy(v.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Min days vacant</Label>
        <Input
          className="mt-1.5"
          type="number"
          placeholder="e.g. 60"
          value={filters.minDaysVacant ?? ""}
          onChange={(e) =>
            onChange({
              minDaysVacant: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      <div>
        <Label>Contact status</Label>
        <div className="mt-2 space-y-1.5">
          {CONTACT_OPTIONS.map((c) => (
            <Checkbox
              key={c.id}
              label={c.label}
              checked={filters.contactStatus?.includes(c.id) ?? false}
              onChange={() => toggleContact(c.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Sort by</Label>
        <Select
          className="mt-1.5"
          value={filters.sort ?? "desirability_score"}
          onChange={(e) =>
            onChange({ sort: e.target.value as ParcelFilters["sort"] })
          }
        >
          <option value="desirability_score">Desirability score</option>
          <option value="market_value">Market value</option>
          <option value="unit_count">Unit count</option>
          <option value="days_vacant">Days vacant</option>
          <option value="last_contacted_at">Last contacted</option>
          <option value="created_at">Recently added</option>
        </Select>
      </div>
    </div>
  );
}

/** Legacy wrapper — prefer ParcelFiltersForm inside layout shells */
export function ParcelFiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: ParcelFilters;
  onChange: (next: Partial<ParcelFilters>) => void;
  onReset: () => void;
}) {
  return (
    <aside className="w-full lg:w-72 lg:shrink-0">
      <div className="space-y-5 rounded-xl border border-ink-200 bg-white p-5 shadow-soft">
        <ParcelFiltersForm filters={filters} onChange={onChange} onReset={onReset} />
      </div>
    </aside>
  );
}
