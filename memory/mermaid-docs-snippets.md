# Mermaid.js Snippets (v10.7.0, via context7)

Ниже собраны фрагменты официальных примеров Mermaid.js (v10.7.0), полученные через context7. Они могут использоваться как контекст при генерации и доработке диаграмм.

---

## Git graph (default theme)

```mermaid
%%{init: { 'logLevel': 'debug', 'theme': 'default' } }%%
gitGraph
        commit type:HIGHLIGHT
        branch hotfix
        checkout hotfix
        commit
        branch develop
        checkout develop
        commit id:"ash" tag:"abc"
        branch featureB
        checkout featureB
        commit type:HIGHLIGHT
        checkout main
        checkout hotfix
        commit type:NORMAL
        checkout develop
        commit type:REVERSE
        checkout featureB
        commit
        checkout main
        merge hotfix
        checkout featureB
        commit
        checkout develop
        branch featureA
        commit
        checkout develop
        merge hotfix
        checkout featureA
        commit
        checkout featureB
        commit
        checkout develop
        merge featureA
        branch release
        checkout release
        commit
        checkout main
        commit
        checkout release
        merge main
        checkout develop
        merge release
```

---

## Flowchart: базовый синтаксис

```mermaid
flowchart LR

A[Hard] -->|Text| B(Round)
B --> C{Decision}
C -->|One| D[Result 1]
C -->|Two| E[Result 2]
```

---

## Flowchart: subgraph и стиль

```mermaid
graph TB
    A
    B
    subgraph foo[Foo SubGraph]
    C
    D
    end
    subgraph bar[Bar SubGraph]
    E
    F
    end
    G

    A-->B
    B-->C
    C-->D
    B-->D
    D-->E
    E-->A
    E-->F
    F-->D
    F-->G
    B-->G
    G-->D

    style foo fill:#F99,stroke-width:2px,stroke:#F0F,color:darkred
    style bar fill:#999,stroke-width:10px,stroke:#0F0,color:blue
```

---

## Flowchart: простой пример

```mermaid
flowchart LR
    id
```

---

## Accessibility: accTitle / accDescr

```mermaid
graph LR
      accTitle: Bob's Burger's Making Big Decisions
      accDescr {
        The official Bob's Burgers corporate processes that are used
        for making very, very big decisions.
        This is actually a very simple flow: identify the big decision and then make the big decision.
         }
      A[Identify Big Decision] --> B{Make Big Decision}
      B --> D[Be done]
```

---

## Flowchart: markdown-строки в лейблах

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
flowchart LR
subgraph "One"
  a("`The **cat**
  in the hat`") -- "edge label" --> b{{"`The **dog** in the hog`"}}
end
subgraph "`**Two**`"
  c("`The **cat**
  in the hat`") -- "`Bold **edge label**`" --> d("The dog in the hog")
end
```
