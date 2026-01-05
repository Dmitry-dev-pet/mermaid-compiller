# Diagram Type Guide

Use this guide to select a Mermaid diagram type based on intent and content.

## Decision shortcuts
- If the user wants a process, decision logic, or hierarchy -> flowchart or block.
- If the user wants interactions over time -> sequence (or zenuml for detailed messages).
- If the user wants architecture services/resources -> architecture (uses architecture-beta syntax).
- If the user wants software architecture views -> c4.
- If the user wants data model (entities + relationships) -> er.
- If the user wants classes/interfaces -> class.
- If the user wants schedules -> gantt; for milestones/history -> timeline.
- If the user wants quantities and comparisons -> pie/radar/xychart/quadrantChart/sankey/treemap.
- If the user wants steps + sentiment -> userJourney.
- If the user wants a state machine -> state.

## Type guidance

### architecture
Use when describing infrastructure/services/resources and their connections.
Best for: cloud systems, CI/CD deployments, service topology, infra components.
Do not use for: org charts or simple hierarchies without service edges.
Keywords: infrastructure, service, resource, cloud, database, server, gateway.

### c4
Use for software architecture perspectives (Context/Container/Component/System).
Best for: system boundaries, software components, containers, context.
Do not use for: generic flow/process or ER data models.
Keywords: context, container, component, system, boundary.

### block
Use for high-level block decomposition and relationships.
Best for: system breakdowns, modules, subsystems, org structure at a coarse level.
Do not use for: time-ordered interactions.
Keywords: module, subsystem, block, layer.

### flowchart
Use for processes, workflows, decision trees, and hierarchies.
Best for: business processes, task flows, approvals, logic.
Do not use for: detailed message ordering between actors (use sequence).
Keywords: process, workflow, decision, step, approval, hierarchy.

### sequence
Use for time-ordered interactions between actors/services.
Best for: request/response flows, API calls, conversations.
Do not use for: static structure or hierarchy.
Keywords: interaction, message, call, request, response, sequence.

### zenuml
Use for detailed sequence-style diagrams with richer syntax.
Best for: precise call flows with conditions/loops.
Do not use for: non-interaction diagrams.
Keywords: sequence detail, precise call flow.

### class
Use for class/object models and relationships.
Best for: OOP design, domain models with inheritance/composition.
Do not use for: database schema with cardinality (use er).
Keywords: class, interface, inheritance, composition, method, attribute.

### er
Use for entity-relationship data models.
Best for: database schema, entities with cardinalities.
Do not use for: class diagrams or process flows.
Keywords: entity, relationship, cardinality, table, schema.

### requirementDiagram
Use for requirements, constraints, and verification links.
Best for: specification mapping, validation chains.
Do not use for: processes or timelines.
Keywords: requirement, constraint, verify, satisfy.

### state
Use for state machines and transitions.
Best for: lifecycle states, finite state flows.
Do not use for: generic process logic (use flowchart).
Keywords: state, transition, event, lifecycle.

### gantt
Use for project schedules and task timelines.
Best for: tasks with start/end dates, dependencies.
Do not use for: unordered milestones (use timeline).
Keywords: schedule, task, timeline, duration, dependency.

### timeline
Use for chronological events and milestones.
Best for: history, evolution, releases.
Do not use for: task scheduling with durations (use gantt).
Keywords: timeline, history, milestone, chronology.

### gitGraph
Use for Git branching and merging history.
Best for: repo history, branching strategies.
Keywords: git, commit, branch, merge.

### kanban
Use for workflow columns and item status.
Best for: work items across stages.
Keywords: kanban, backlog, in progress, done.

### mindmap
Use for hierarchical topics around a central idea.
Best for: brainstorming, topic trees, outlines.
Keywords: topic, brainstorm, tree, mind map.

### quadrantChart
Use for 2x2 positioning by two axes.
Best for: prioritization matrices, segmentation.
Keywords: quadrant, matrix, axis, low/high.

### radar
Use for comparing multiple categories across dimensions.
Best for: capability comparison, scores across axes.
Keywords: radar, spider, dimension, comparison.

### pie
Use for part-to-whole proportions.
Best for: shares, composition, percentages.
Keywords: share, proportion, percentage.

### xychart
Use for numeric series on X/Y axes (bar/line).
Best for: trends, metrics, time series.
Keywords: series, chart, trend, metric.

### sankey
Use for flow volumes between nodes/states.
Best for: energy/material/user flows with quantities.
Keywords: flow, volume, transfer, distribution.

### treemap
Use for hierarchical part-to-whole sized blocks.
Best for: composition with hierarchy and sizes.
Keywords: treemap, hierarchy, size, composition.

### userJourney
Use for steps with actor sentiment/emotion.
Best for: UX journeys, touchpoints, sentiment.
Keywords: journey, touchpoint, sentiment, experience.

### packet
Use for network packet structures and fields.
Best for: protocol layouts, headers/fields.
Keywords: packet, header, field, protocol.
