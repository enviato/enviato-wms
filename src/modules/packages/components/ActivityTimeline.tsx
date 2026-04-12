"use client";

import React from "react";
import { Clock } from "lucide-react";
import { ActivityLog, getActivityConfig, getActivityLabel, fmtDate, fmtTime, fmtRelative } from "../types";

interface ActivityTimelineProps {
  activityLog: ActivityLog[];
  checkedInUser?: { first_name: string; last_name: string } | null;
  checkedInAt: string;
}

export default function ActivityTimeline({
  activityLog,
  checkedInUser,
  checkedInAt,
}: ActivityTimelineProps) {
  return (
    <div className="bg-white border border-border rounded-lg p-4 lg:sticky lg:top-5">
      <p className="text-ui font-semibold text-txt-primary tracking-tight mb-4 flex items-center gap-1.5">
        <Clock size={14} className="text-txt-tertiary" />
        Activity
      </p>

      {activityLog.length > 0 ? (
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />

          <div className="space-y-0">
            {activityLog.map((log, i) => {
              const ac = getActivityConfig(log.action);
              return (
                <div key={log.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {/* Timeline node with SVG illustration */}
                  <div
                    className="relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: ac.bg, border: `1.5px solid ${ac.color}20` }}
                  >
                    {ac.svg}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-ui leading-snug text-txt-primary">
                      {getActivityLabel(log.action)}
                    </p>
                    {log.metadata?.description && (
                      <p className="text-muted mt-0.5 leading-snug text-txt-tertiary">
                        {log.metadata.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {log.user && (
                        <>
                          <span className="text-ui-sm text-txt-secondary">
                            {log.user.first_name} {log.user.last_name}
                          </span>
                          <span className="text-ui-sm text-slate-300">·</span>
                        </>
                      )}
                      <span
                        className="text-ui-sm text-txt-secondary"
                        title={`${fmtDate(log.created_at)} ${fmtTime(log.created_at)}`}
                      >
                        {fmtRelative(log.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <Clock size={20} className="text-txt-placeholder mx-auto mb-2" />
          <p className="text-muted text-txt-tertiary">No activity yet</p>
        </div>
      )}

      {/* Checked-in-by info */}
      {checkedInUser && (
        <div className="mt-4 pt-3 border-t border-border-light">
          <p className="text-meta text-txt-tertiary">
            Checked in by <span className="font-medium text-txt-secondary">{checkedInUser.first_name} {checkedInUser.last_name}</span>
          </p>
          <p className="text-meta text-txt-tertiary mt-0.5">
            {fmtDate(checkedInAt)} at {fmtTime(checkedInAt)}
          </p>
        </div>
      )}
    </div>
  );
}
