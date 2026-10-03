import type { IOptionRule, IOptionRuleOverride } from "./inventory";

/** Una lista vacía guardada también reemplaza la regla global. */
export const getEffectiveOptionRules = (
    rules: IOptionRule[],
    ruleOverrides: IOptionRuleOverride[],
    variantId: string,
    optionId: string,
): IOptionRule[] => {
    const override = ruleOverrides.find((entry) => entry.variantId === variantId && entry.optionId === optionId);
    return override ? override.rules : rules.filter((rule) => rule.optionId === optionId);
};

/** Conserva las reglas globales y las de los otros productos y opciones. */
export const setOptionRuleOverride = (
    ruleOverrides: IOptionRuleOverride[],
    variantId: string,
    optionId: string,
    rules: IOptionRule[],
): IOptionRuleOverride[] => [
    ...ruleOverrides.filter((entry) => entry.variantId !== variantId || entry.optionId !== optionId),
    { variantId, optionId, rules },
];
