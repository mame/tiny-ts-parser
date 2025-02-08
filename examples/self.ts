import { error } from "../tiny-ts-parser.ts";

type Type =
  | { tag: "Boolean" }
  | { tag: "Number" }
  | { tag: "String" }
  | { tag: "Array"; elemType: Type }
  | { tag: "Record"; elemType: Type }
  | { tag: "Func"; params: Param[]; retType: Type }
  | { tag: "Object"; props: PropertyType[] }
  | { tag: "TaggedUnion"; variants: VariantType[] }
  | { tag: "Rec"; name: string; type: Type }
  | { tag: "TypeVar"; name: string }
  | { tag: "Undefined" };

type Param = { name: string; type: Type };
type PropertyType = { name: string; type: Type };
type VariantType = { label: string; props: PropertyType[] };

type Term =
  | { tag: "true" }
  | { tag: "false" }
  | { tag: "compare"; op: string; left: Term; right: Term }
  | { tag: "if"; cond: Term; thn: Term; els: Term }
  | { tag: "number"; n: number }
  | { tag: "add"; left: Term; right: Term }
  | { tag: "string"; s: string }
  | { tag: "var"; name: string }
  | { tag: "func"; params: Param[]; body: Term }
  | { tag: "call"; func: Term; args: Term[] }
  | { tag: "seq"; body: Term; rest: Term }
  | { tag: "const"; name: string; init: Term; rest: Term }
  | { tag: "for"; ary: Term; body: Term; idx: string; rest: Term }
  | { tag: "forOf"; ary: Term; body: Term; var: string; rest: Term }
  | { tag: "arrayNew"; aryType: Type }
  | { tag: "arrayExt"; ary: Term; val: Term }
  | { tag: "recordNew"; recordType: Type }
  | { tag: "recordCopy"; record: Term }
  | { tag: "recordExt"; record: Term; key: Term; val: Term }
  | { tag: "recordIn"; record: Term; key: Term }
  | { tag: "member"; base: Term, index: Term }
  | { tag: "objectNew"; props: PropertyTerm[] }
  | { tag: "objectGet"; obj: Term; propName: string }
  | { tag: "taggedUnionNew"; label: string; props: PropertyTerm[]; as: Type }
  | { tag: "taggedUnionExt"; term: Term; as: Type }
  | { tag: "taggedUnionGet"; varName: string; clauses: VariantTerm[]; defaultClause: Term }
  | {
    tag: "recFunc";
    funcName: string;
    params: Param[];
    retType: Type;
    body: Term;
    rest: Term;
  }
  | { tag: "undefined" };

type PropertyTerm = { name: string; term: Term };
type VariantTerm = { label: string; term: Term };

type TypeEnv = Record<string, Type>;

type PropertyTypeFind = { tag: "found"; name: string, type: Type } | { tag: "notFound" };
function propertyTypeFind(props: PropertyType[], pred: (prop: PropertyType) => boolean): PropertyTypeFind {
  for (const prop of props) {
    if (pred(prop)) return <PropertyTypeFind>{ tag: "found", name: prop.name, type: prop.type };
  }
  return <PropertyTypeFind>{ tag: "notFound" };
}

type VariantTypeFind = { tag: "found"; label: string; props: PropertyType[] } | { tag: "notFound" };
function variantTypeFind(variants: VariantType[], pred: (variant: VariantType) => boolean): VariantTypeFind {
  for (const variant of variants) {
    if (pred(variant)) return <VariantTypeFind>{ tag: "found", label: variant.label, props: variant.props };
  }
  return <VariantTypeFind>{ tag: "notFound" };
}

function propertyTypeMapSub(props: PropertyType[], f: (prop: PropertyType) => PropertyType, newProps: PropertyType[], i: number): PropertyType[] {
  return i === props.length ? newProps : propertyTypeMapSub(props, f, [...newProps, f(props[i])], i + 1);
}
function propertyTypeMap(props: PropertyType[], f: (prop: PropertyType) => PropertyType): PropertyType[] {
  return propertyTypeMapSub(props, f, <PropertyType[]>[], 0);
}

function variantTypeMapSub(variants: VariantType[], f: (variant: VariantType) => VariantType, newVariants: VariantType[], i: number): VariantType[] {
  return i === variants.length ? newVariants : variantTypeMapSub(variants, f, [...newVariants, f(variants[i])], i + 1);
}
function variantTypeMap(variants: VariantType[], f: (prop: VariantType) => VariantType): VariantType[] {
  return variantTypeMapSub(variants, f, <VariantType[]>[], 0);
}

function propertyTermMapSub(props: PropertyTerm[], f: (prop: PropertyTerm) => PropertyType, newProps: PropertyType[], i: number): PropertyType[] {
  return i === props.length ? newProps : propertyTermMapSub(props, f, [...newProps, f(props[i])], i + 1);
}
function propertyTermMap(props: PropertyTerm[], f: (prop: PropertyTerm) => PropertyType): PropertyType[] {
  return propertyTermMapSub(props, f, <PropertyType[]>[], 0);
}

function paramToTypeEnvSub(params: Param[], tyEnv: TypeEnv, i: number): TypeEnv {
  return i === params.length ? tyEnv : paramToTypeEnvSub(params, { ...tyEnv, [params[i].name]: params[i].type }, i + 1);
}
function paramToTypeEnv(params: Param[], tyEnv: TypeEnv): TypeEnv {
  return paramToTypeEnvSub(params, tyEnv, 0);
}

function clausetoRetTypeSub(clauses: VariantTerm[], f: (type: Type, clause: VariantTerm) => Type, base: Type, i: number): Type {
  return i === clauses.length ? base : clausetoRetTypeSub(clauses, f, f(base, clauses[i]), i + 1);
}
function clauseToRetType(clauses: VariantTerm[], base: Type, f: (type: Type, clause: VariantTerm) => Type): Type {
  return clausetoRetTypeSub(clauses, f, base, 0);
}

function variantsFilterSub(variants: VariantType[], f: (variant: VariantType) => boolean, newVariants: VariantType[], i: number): VariantType[] {
  return i === variants.length ? newVariants : variantsFilterSub(variants, f, f(variants[i]) ? [...newVariants, variants[i]] : newVariants, i + 1);
}
function variantsFilter(variants: VariantType[], f: (variant: VariantType) => boolean): VariantType[] {
  return variantsFilterSub(variants, f, <VariantType[]>[], 0);
}

function variantTermAny(clauses: VariantTerm[], f: (clause: VariantTerm) => boolean): boolean {
  for (const clause of clauses) {
    if (f(clause)) return true;
  }
  return false;
}

function variantTypeAny(clauses: VariantType[], f: (clause: VariantType) => boolean): boolean {
  for (const clause of clauses) {
    if (f(clause)) return true;
  }
  return false;
}

function typeEqNaive(ty1: Type, ty2: Type, map: Record<string, string>): boolean {
  if (ty1.tag === "Undefined") return true;
  if (ty2.tag === "Undefined") return true;

  switch (ty2.tag) {
    case "Boolean": {
      return ty1.tag === "Boolean";
    }
    case "Number": {
      return ty1.tag === "Number";
    }
    case "String": {
      return ty1.tag === "String";
    }
    case "Array": {
      if (ty1.tag !== "Array") return false;
      return typeEqNaive(ty1.elemType, ty2.elemType, map);
    }
    case "Record": {
      if (ty1.tag !== "Record") return false;
      return typeEqNaive(ty1.elemType, ty2.elemType, map);
    }
    case "Func": {
      if (ty1.tag !== "Func") return false;
      for (let i = 0; i < ty1.params.length; i++) {
        if (!typeEqNaive(ty1.params[i].type, ty2.params[i].type, map)) return false;
      }
      if (!typeEqNaive(ty1.retType, ty2.retType, map)) return false;
      return true;
    }
    case "Object": {
      if (ty1.tag !== "Object") return false;
      if (ty1.props.length !== ty2.props.length) return false;
      for (const prop1 of ty1.props) {
        const prop2 = propertyTypeFind(ty2.props, (prop2: PropertyType) => prop1.name === prop2.name);
        switch (prop2.tag) {
          case "notFound":
            return false;
          case "found":
            if (!typeEqNaive(prop1.type, prop2.type, map)) return false;
        }
      }
      return true;
    }
    case "TaggedUnion": {
      if (ty1.tag !== "TaggedUnion") return false;
      if (ty1.variants.length !== ty2.variants.length) return false;
      for (const variant1 of ty1.variants) {
        const found = variantTypeFind(ty2.variants, (variant2: VariantType) => variant1.label === variant2.label);
        switch (found.tag) {
          case "notFound":
            return false;
          case "found": {
            const variantProps2 = found.props;
            if (variant1.props.length !== variantProps2.length) return false;
            for (const prop1 of variant1.props) {
              const found = propertyTypeFind(variantProps2, (prop2: PropertyType) => prop1.name === prop2.name);
              switch (found.tag) {
                case "notFound":
                  return false;
                case "found": {
                  const prop2 = found;
                  if (!typeEqNaive(prop1.type, prop2.type, map)) return false;
                }
              }
            }
          }
        }
      }
      return true;
    }
    case "Rec": {
      if (ty1.tag !== "Rec") return false;
      const newMap = { ...map, [ty1.name]: ty2.name };
      return typeEqNaive(ty1.type, ty2.type, newMap);
    }
    case "TypeVar": {
      if (ty1.tag !== "TypeVar") return false;
      return map[ty1.name] === ty2.name;
    }
  }
}

function expandType(ty: Type, tyVarName: string, repTy: Type): Type {
  switch (ty.tag) {
    case "Boolean":
      return <Type>{ tag: "Boolean" };
    case "Number":
      return <Type>{ tag: "Number" };
    case "String":
      return <Type>{ tag: "String" };
    case "Array": {
      return <Type>{ tag: "Array", elemType: expandType(ty.elemType, tyVarName, repTy) };
    }
    case "Record": {
      return <Type>{ tag: "Record", elemType: expandType(ty.elemType, tyVarName, repTy) };
    }
    case "Func": {
      const params = propertyTypeMap(ty.params, (param: PropertyType) => ({ name: param.name, type: expandType(param.type, tyVarName, repTy) }));
      const retType = expandType(ty.retType, tyVarName, repTy);
      return <Type>{ tag: "Func", params, retType };
    }
    case "Object": {
      const props = propertyTypeMap(ty.props, (param: PropertyType) => ({ name: param.name, type: expandType(param.type, tyVarName, repTy) }));
      return <Type>{ tag: "Object", props };
    }
    case "TaggedUnion": {
      const variants = variantTypeMap(ty.variants, (variant: VariantType) => {
        const newProps = propertyTypeMap(variant.props, (prop: PropertyType) => ({ name: prop.name, type: expandType(prop.type, tyVarName, repTy) }));
        return { label: variant.label, props: newProps };
      });
      return <Type>{ tag: "TaggedUnion", variants };
    }
    case "Rec": {
      if (ty.name === tyVarName) return <Type>{ tag: "Rec", name: ty.name, type: ty.type };
      return <Type>{ tag: "Rec", name: ty.name, type: expandType(ty.type, tyVarName, repTy) };
    }
    case "TypeVar": {
      return ty.name === tyVarName ? repTy : <Type>{ tag: "TypeVar", name: ty.name };
    }
    case "Undefined":
      return <Type>{ tag: "Undefined" };
  }
}

function simplifyType(ty: Type): Type {
  if (ty.tag === "Rec") return expandType(ty.type, ty.name, <Type>{ tag: "Rec", name: ty.name, type: ty.type });
  return <Type>ty;
}

function typeEqSub(ty1: Type, ty2: Type, seen: { left: Type, right: Type }[]): boolean {
  for (const tuple of seen) {
    if (typeEqNaive(tuple.left, ty1, <Record<string, string>>{})) {
      if (typeEqNaive(tuple.right, ty2, <Record<string, string>>{})) {
        return true;
      }
    }
  }
  if (ty1.tag === "Rec") return typeEqSub(simplifyType(<Type>ty1), <Type>ty2, [...seen, { left: <Type>ty1, right: <Type>ty2 }]);
  if (ty2.tag === "Rec") return typeEqSub(<Type>ty1, simplifyType(<Type>ty2), [...seen, { left: <Type>ty1, right: <Type>ty2 }]);

  if (ty1.tag === "Undefined") return true;
  if (ty2.tag === "Undefined") return true;

  switch (ty2.tag) {
    case "Boolean":
      return ty1.tag === "Boolean";
    case "Number":
      return ty1.tag === "Number";
    case "String":
      return ty1.tag === "String";
    case "Array": {
      if (ty1.tag !== "Array") return false;
      return typeEqSub(ty1.elemType, ty2.elemType, seen);
    }
    case "Record": {
      if (ty1.tag !== "Record") return false;
      return typeEqSub(ty1.elemType, ty2.elemType, seen);
    }
    case "Func": {
      if (ty1.tag !== "Func") return false;
      if (ty1.params.length !== ty2.params.length) return false;
      for (let i = 0; i < ty1.params.length; i++) {
        if (!typeEqSub(ty1.params[i].type, ty2.params[i].type, seen)) return false;
      }
      if (!typeEqSub(ty1.retType, ty2.retType, seen)) return false;
      return true;
    }
    case "Object": {
      if (ty1.tag !== "Object") return false;
      if (ty1.props.length !== ty2.props.length) return false;
      for (const prop2 of ty2.props) {
        const found = propertyTypeFind(ty1.props, (prop1: PropertyType) => prop1.name === prop2.name);
        switch (found.tag) {
          case "notFound":
            return false;
          case "found": {
            const prop1 = found;
            if (!typeEqSub(prop1.type, prop2.type, seen)) return false;
          }
        }
      }
      return true;
    }
    case "TaggedUnion": {
      if (ty1.tag !== "TaggedUnion") return false;
      if (ty1.variants.length !== ty2.variants.length) return false;
      for (const variant1 of ty1.variants) {
        const found = variantTypeFind(ty2.variants, (variant2: VariantType) => variant1.label === variant2.label);
        switch (found.tag) {
          case "notFound":
            return false;
          case "found": {
            const variant2 = found;
            if (variant1.props.length !== variant2.props.length) return false;
            for (const prop1 of variant1.props) {
              const found = propertyTypeFind(variant2.props, (prop2: PropertyType) => prop1.name === prop2.name);
              switch (found.tag) {
                case "notFound":
                  return false;
                case "found": {
                  const prop2 = found;
                  if (!typeEqSub(prop1.type, prop2.type, seen)) return false;
                }
              }
            }
          }
        }
      }
      return true;
    }
    case "TypeVar":
      throw "unreachable";
  }
}

function typeEq(ty1: Type, ty2: Type): boolean {
  return typeEqSub(ty1, ty2, <{ left: Type, right: Type }[]>[]);
}

function typeJoin(ty1: Type, ty2: Type): Type {
  if (ty1.tag !== "Undefined") return <Type>ty1;
  return ty2;
}

export function typecheck(t: Term, tyEnv: TypeEnv): Type {
  switch (t.tag) {
    case "true":
      return <Type>{ tag: "Boolean" };
    case "false":
      return <Type>{ tag: "Boolean" };
    case "if": {
      const condTy = simplifyType(typecheck(t.cond, tyEnv));
      if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
      const thnTy = typecheck(t.thn, tyEnv);
      const elsTy = typecheck(t.els, tyEnv);
      if (!typeEq(thnTy, elsTy)) error("then and else have different types", t);
      return typeJoin(thnTy, elsTy);
    }
    case "number":
      return <Type>{ tag: "Number" };
    case "add": {
      const leftTy = simplifyType(typecheck(t.left, tyEnv));
      if (leftTy.tag !== "Number") error("number expected", t.left);
      const rightTy = simplifyType(typecheck(t.right, tyEnv));
      if (rightTy.tag !== "Number") error("number expected", t.right);
      return <Type>{ tag: "Number" };
    }
    case "compare": {
      const leftTy = simplifyType(typecheck(t.left, tyEnv));
      const rightTy = simplifyType(typecheck(t.right, tyEnv));
      if (!typeEq(leftTy, rightTy)) error("compare different types", t.left);
      return <Type>{ tag: "Boolean" };
    }
    case "string":
      return <Type>{ tag: "String" };
    case "var": {
      if (!(t.name in tyEnv)) error(`unknown variable: ${t.name}`, t);
      return tyEnv[t.name];
    }
    case "func": {
      const newTyEnv = paramToTypeEnv(t.params, tyEnv);
      const retType = typecheck(t.body, newTyEnv);
      return <Type>{ tag: "Func", params: t.params, retType };
    }
    case "call": {
      const funcTy = simplifyType(typecheck(t.func, tyEnv));
      if (funcTy.tag !== "Func") error("function type expected", t.func);
      if (funcTy.params.length !== t.args.length)
        error("wrong number of arguments", t);
      for (let i = 0; i < t.args.length; i++) {
        const argTy = simplifyType(typecheck(t.args[i], tyEnv));
        if (!typeEq(argTy, funcTy.params[i].type))
          error("parameter type mismatch", t.args[i]);
      }
      return funcTy.retType;
    }
    case "seq":
      typecheck(t.body, tyEnv);
      return typecheck(t.rest, tyEnv);
    case "const": {
      const ty = typecheck(t.init, tyEnv);
      const newTyEnv = { ...tyEnv, [t.name]: ty };
      return typecheck(t.rest, newTyEnv);
    }
    case "for": {
      const aryTy = simplifyType(typecheck(t.ary, tyEnv));
      if (aryTy.tag !== "Array") error("array expected", t.ary);
      const newTyEnv: TypeEnv = { ...tyEnv, [t.idx]: <Type>{ tag: "Number" } };
      const bodyTy = typecheck(t.body, newTyEnv);
      const restTy = typecheck(t.rest, tyEnv);
      if (!typeEq(bodyTy, restTy)) error(`return type is inconsistent`, t);
      return typeJoin(bodyTy, restTy);
    }
    case "forOf": {
      const aryTy = simplifyType(typecheck(t.ary, tyEnv));
      if (aryTy.tag !== "Array") error("array expected", t.ary);
      const newTyEnv: TypeEnv = { ...tyEnv, [t.var]: aryTy.elemType };
      const bodyTy = typecheck(t.body, newTyEnv);
      const restTy = typecheck(t.rest, tyEnv);
      if (!typeEq(bodyTy, restTy)) error(`return type is inconsistent`, t);
      return typeJoin(bodyTy, restTy);
    }
    case "arrayNew": {
      const retTy = t.aryType;
      if (t.aryType.tag !== "Array") error(`arrayNew must have a type "<sometype[]>"`, t);
      return retTy;
    }
    case "arrayExt": {
      const aryTy = simplifyType(typecheck(t.ary, tyEnv));
      if (aryTy.tag !== "Array") error("array expected", t.ary);
      const valTy = simplifyType(typecheck(t.val, tyEnv));
      if (!typeEq(aryTy.elemType, valTy)) error("value type is inconsistent", t.val);
      return <Type>aryTy;
    }
    case "recordNew": {
      const retTy = t.recordType;
      if (t.recordType.tag !== "Record") error(`recordNew must have a type "Record<string, sometype>"`, t);
      return retTy;
    }
    case "recordCopy": {
      throw new Error("unimplemented");
    }
    case "recordExt": {
      const recordTy = simplifyType(typecheck(t.record, tyEnv));
      if (recordTy.tag !== "Record") error("record expected", t.record);
      const keyTy = simplifyType(typecheck(t.key, tyEnv));
      if (keyTy.tag !== "String") error("string expected", t.key);
      const valTy = simplifyType(typecheck(t.val, tyEnv));
      if (!typeEq(recordTy.elemType, valTy)) error("value type is inconsistent", t.val);
      return <Type>recordTy;
    }
    case "recordIn": {
      const recordTy = simplifyType(typecheck(t.record, tyEnv));
      if (recordTy.tag !== "Record") error("record expected", t.record);
      const keyTy = simplifyType(typecheck(t.key, tyEnv));
      if (keyTy.tag !== "String") error("string expected", t.key);
      return <Type>{ tag: "Boolean" };
    }
    case "member": {
      const baseTy = simplifyType(typecheck(t.base, tyEnv));
      const indexTy = simplifyType(typecheck(t.index, tyEnv));
      switch (baseTy.tag) {
        case "Array": {
          if (indexTy.tag !== "Number") error("number expected", t.index);
          return baseTy.elemType
        }
        case "Record": {
          if (indexTy.tag !== "String") error("string expected", t.index);
          return baseTy.elemType;
        }
        default: {
          error("array or record expected", t.base);
          throw new Error("unreachable");
        }
      }
    }
    case "objectNew": {
      const props = propertyTermMap(t.props, (prop: PropertyTerm) => ({ name: prop.name, type: typecheck(prop.term, tyEnv) }));
      return <Type>{ tag: "Object", props };
    }
    case "objectGet": {
      const objectTy = simplifyType(typecheck(t.obj, tyEnv));
      switch (objectTy.tag) {
        case "TaggedUnion": {
          if (objectTy.variants.length === 1) {
            const props = objectTy.variants[0].props;
            const found = propertyTypeFind(props, (prop: PropertyType) => prop.name === t.propName);
            switch (found.tag) {
              case "found":
                return found.type;
              default:
                error(`unknown property name: ${t.propName}`, t);
            }
          }
          if (t.propName !== "tag") error(`only "tag" is readable on tagged union`, t);
          return <Type>{ tag: "String"}
        }
        case "Object": {
          const found = propertyTypeFind(objectTy.props, (prop: PropertyType) => prop.name === t.propName);
          switch (found.tag) {
            case "found":
              return found.type;
            default:
              error(`unknown property name: ${t.propName}`, t);
              throw new Error("unreachable");
          }
        }
        case "Array": {
          if (t.propName !== "length") error(`only "length" is readable on array`, t);
          return <Type>{ tag: "Number" };
        }
        default: {
          error("object type expected", t.obj);
          throw new Error("unreachable");
        }
      }
    }
    case "taggedUnionNew": {
      const asTy = simplifyType(t.as);
      if (asTy.tag !== "TaggedUnion") error(`"as" must have a tagged union type`, t);
      const found = variantTypeFind(asTy.variants, (variant: VariantType) => variant.label === t.label);
      switch (found.tag) {
        case "found": {
          const expectedProps = found.props;
          for (const prop1 of t.props) {
            const found = propertyTypeFind(expectedProps, (prop2: PropertyType) => prop1.name === prop2.name);
            switch (found.tag) {
              case "notFound":
                error(`unknown property: ${ prop1.name }`, t);
                throw new Error("unreachable");
              case "found": {
                const expectedTy = found.type;
                const actualTy = typecheck(prop1.term, tyEnv);
                if (!typeEq(expectedTy, actualTy)) error("tagged union's term has a wrong type", prop1.term);
              }
            }
          }
          return t.as;
        }
        default:
          error(`unknown variant label: ${t.label}`, t);
          throw new Error("unreachable");
      }
    }
    case "taggedUnionExt": {
      const termTy = simplifyType(typecheck(t.term, tyEnv));
      const retTy = simplifyType(t.as);
      if (retTy.tag !== "TaggedUnion") error(`term must have a tagged union type`, t);
      if (termTy.tag !== "TaggedUnion") error(`term must have a tagged union type`, t);
      for (const variant0 of termTy.variants) {
        if (!variantTypeAny(retTy.variants, (variant: VariantType) => variant0.label === variant.label)) {
          error(`tagged union has a wrong variant: ${variant0.label}`, t);
        }
      }
      return <Type>retTy;
    }
    case "taggedUnionGet": {
      const variantTy = simplifyType(tyEnv[t.varName]);
      if (variantTy.tag !== "TaggedUnion") error(`variable ${t.varName} must have a tagged union type`, t);
      const defaultVariants = variantsFilter(variantTy.variants, (variant: VariantType) => {
        return !variantTermAny(t.clauses, (clause: VariantTerm) => clause.label === variant.label);
      });
      const defaultLocalTy: Type = <Type>{ tag: "TaggedUnion", variants: defaultVariants };
      const newTyEnv = { ...tyEnv, [t.varName]: defaultLocalTy };
      const defaultRetTy = typecheck(t.defaultClause, newTyEnv);
      const retTy = clauseToRetType(t.clauses, defaultRetTy, (retTy: Type, clause: VariantTerm) => {
        const found = variantTypeFind(variantTy.variants, (variant: VariantType) => variant.label === clause.label);
        switch (found.tag) {
          case "found": {
            const newVariants = [...<VariantType[]>[], { label: clause.label, props: found.props }];
            const localTy = <Type>{ tag: "TaggedUnion", variants: newVariants };
            const newTyEnv = { ...tyEnv, [t.varName]: localTy };
            const retTy1 = typecheck(clause.term, newTyEnv);
            if (!typeEq(retTy, retTy1)) error("clauses has different types", t);
            return typeJoin(retTy, retTy1);
          }
          case "notFound":
            error(`tagged union type has no case: ${clause.label}`, clause.term);
            throw new Error("unreachable");
        }
      });
      return retTy;
    }
    case "recFunc": {
      const funcTy: Type = <Type>{ tag: "Func", params: t.params, retType: t.retType };
      const newTyEnv = paramToTypeEnv(t.params, tyEnv);
      const newTyEnv2 = { ...newTyEnv, [t.funcName]: funcTy };
      const retTy = typecheck(t.body, newTyEnv2);
      if (!typeEq(t.retType, retTy)) error("wrong return type", t);
      const newTyEnv3 = { ...tyEnv, [t.funcName]: funcTy };
      return typecheck(t.rest, newTyEnv3);
    }
    case "undefined": {
      return <Type>{ tag: "Undefined" };
    }
  }
}
