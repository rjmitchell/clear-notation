"""Registry loading for machine-readable directive specs."""

from __future__ import annotations

from typing import Any, cast

from .models import AttributeSpec, DirectiveSpec


class Registry:
    def __init__(self, directives: dict[str, DirectiveSpec]) -> None:
        self._directives = directives

    @classmethod
    def from_toml(cls, data: dict[str, Any]) -> "Registry":
        directives: dict[str, DirectiveSpec] = {}
        for row in cast(list[dict[str, Any]], data.get("directive", [])):
            attrs: dict[str, AttributeSpec] = {}
            for attr in cast(list[dict[str, Any]], row.get("attribute", [])):
                spec = AttributeSpec(
                    name=attr["name"],
                    type_name=attr["type"],
                    required=bool(attr["required"]),
                    default=attr.get("default"),
                    allowed_values=tuple(attr.get("allowed_values", [])),
                    cardinality=attr.get("cardinality"),
                )
                attrs[spec.name] = spec
            directive = DirectiveSpec(
                name=row["name"],
                placement=row["placement"],
                body_mode=row["body_mode"],
                attributes=attrs,
            )
            directives[directive.name] = directive
        return cls(directives)

    def block(self, name: str) -> DirectiveSpec | None:
        spec = self._directives.get(name)
        if spec is None or spec.placement != "block":
            return None
        return spec

    def inline(self, name: str) -> DirectiveSpec | None:
        spec = self._directives.get(name)
        if spec is None or spec.placement != "inline":
            return None
        return spec

    def any(self, name: str) -> DirectiveSpec | None:
        return self._directives.get(name)
