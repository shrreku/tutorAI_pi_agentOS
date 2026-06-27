# ADR-0028: Study Activity Intervals Separate Time From Session Liveness

Status: Accepted

Date: 2026-06-27

Learner-visible Study time is the sum of persisted Study Activity Intervals across Tutor, Study Map, Reference, Evidence, Practice, and Interactive surfaces. Tutor Session status is a separate continuity concern and must not be used as elapsed-time truth. The web client emits bounded semantic activity pulses while visible; the API coalesces them into intervals, caps abandoned intervals at the inactivity boundary, and expires them lazily without an always-on sweeper.

Tutor Session liveness uses structured Tutor Turn Disposition rather than raw prose parsing: informational responses prompt after 15 minutes of inactivity, while turns awaiting a learner answer or interactive task prompt after 30 minutes. No response pauses the session; continuing resumes it. This gives learners more thinking time without counting the full waiting window as active study.
