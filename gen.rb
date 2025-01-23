require "erb"

def output(sys, suffix = nil)
  code = ERB.new(<<END, trim_mode: "%").result_with_hash({ sys: })
import { error } from "tiny-ts-parser";
------

% if sys == :arith
type Type =
  | { tag: "Boolean" }
  | { tag: "Number" }
  ;
% else
type Type =
  | { tag: "Boolean" }
  | { tag: "Number" }
  | { tag: "Func"; params: Param[]; retType: Type }
%   if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2
  | { tag: "Object"; props: PropertyType[] }
%   end
%   if sys == :union || sys == :rec2
  | { tag: "TaggedUnion"; variants: VariantType[] }
%   end
%   if sys == :rec || sys == :rec2
  | { tag: "Rec"; name: string; type: Type }
%   end
%   if sys == :poly_bug || sys == :poly
  | { tag: "TypeAbs"; typeParams: string[]; type: Type }
%   end
%   if sys == :rec || sys == :rec2 || sys == :poly_bug || sys == :poly
  | { tag: "TypeVar"; name: string }
%   end
  ;
% end
% if sys != :arith

type Param = { name: string; type: Type };
% end
% if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2
type PropertyType = { name: string; type: Type };
% end
% if sys == :union || sys == :rec2
type VariantType = { label: string; type: Type };
% end

type Term =
  | { tag: "true" }
  | { tag: "false" }
  | { tag: "if"; cond: Term; thn: Term; els: Term }
  | { tag: "number"; n: number }
  | { tag: "add"; left: Term; right: Term }
% if sys != :arith
  | { tag: "var"; name: string }
% if sys != :recfunc2
  | { tag: "func"; params: Param[]; body: Term }
% else
  | { tag: "func"; params: Param[]; retType?: Type; body: Term }
% end
  | { tag: "call"; func: Term; args: Term[] }
% if sys != :basic2
  | { tag: "seq"; body: Term; rest: Term }
  | { tag: "const"; name: string; init: Term; rest: Term }
% else
  | { tag: "seq2"; body: Term[] }
  | { tag: "const2"; name: string; init: Term }
% end
% end
% if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2
  | { tag: "objectNew"; props: PropertyTerm[] }
  | { tag: "objectGet"; obj: Term; propName: string }
% end
% if sys == :union || sys == :rec2
  | { tag: "taggedUnionNew"; label: string; term: Term; as: Type }
  | { tag: "taggedUnionGet"; varName: string; clauses: VariantTerm[] }
% end
% if sys == :recfunc || sys == :recfunc2 || sys == :rec || sys == :rec2
  | {
    tag: "recFunc";
    funcName: string;
    params: Param[];
    retType: Type;
    body: Term;
    rest: Term;
  }
% end
% if sys == :poly_bug || sys == :poly
  | { tag: "typeAbs"; typeParams: string[]; body: Term }
  | { tag: "typeApp"; typeAbs: Term; typeArgs: Type[] }
% end
  ;
% if sys != :arith
% if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2

type PropertyTerm = { name: string; term: Term };
% end
% if sys == :union || sys == :rec2
type VariantTerm = { label: string; term: Term };
% end
% end
------
% if sys != :arith

type TypeEnv = Record<string, Type>;
% end
% if sys == :rec || sys == :rec2

function typeEqNaive(ty1: Type, ty2: Type, map: Record<string, string>): boolean {
  switch (ty2.tag) {
    case "Boolean":
    case "Number":
      return ty1.tag === ty2.tag;
    case "Func": {
      if (ty1.tag !== "Func") return false;
      for (let i = 0; i < ty1.params.length; i++) {
        if (!typeEqNaive(ty1.params[i].type, ty2.params[i].type, map)) return false;
      }
      if (!typeEqNaive(ty1.retType, ty2.retType, map)) return false;
      return true;
    }
%   if sys == :rec || sys == :rec2
    case "Object": {
      if (ty1.tag !== "Object") return false;
      if (ty1.props.length !== ty2.props.length) return false;
      for (const { name: name1, type: propTy1 } of ty1.props) {
        const found = ty2.props.find(({ name }) => name1 === name);
        if (!found) return false;
        const { type: propTy2 } = found;
        if (!typeEqNaive(propTy1, propTy2, map)) return false;
      }
      return true;
    }
%   end
%   if sys == :rec2
    case "TaggedUnion": {
      if (ty1.tag !== "TaggedUnion") return false;
      if (ty1.variants.length !== ty2.variants.length) return false;
      for (const { label: label1, type: variantTy1 } of ty1.variants) {
        const found = ty2.variants.find(({ label }) => label === label1);
        if (!found) return false;
        const { type: variantTy2 } = found;
        if (!typeEqNaive(variantTy1, variantTy2, map)) return false;
      }
      return true;
    }
%   end
%   if sys == :rec || sys == :rec2
    case "Rec": {
      if (ty1.tag !== "Rec") return false;
      const newMap = { ...map, [ty1.name]: ty2.name };
      return typeEqNaive(ty1.type, ty2.type, newMap);
    }
%   end
    case "TypeVar": {
      if (ty1.tag !== "TypeVar") return false;
      return map[ty1.name] === ty2.name;
    }
  }
}
% end
% if sys == :poly

let freshTyVarId = 1;

function freshTypeAbs(typeParams: string[], ty: Type): { newTypeParams: string[]; newType: Type } {
  let newType = ty;
  const newTypeParams = [];
  for (const tyVar of typeParams) {
    const newTyVar = `${tyVar}@${freshTyVarId++}`;
    newType = subst(newType, tyVar, { tag: "TypeVar", name: newTyVar });
    newTypeParams.push(newTyVar);
  }
  return { newTypeParams, newType };
}
%end
% if sys == :rec || sys == :rec2 || sys == :poly_bug || sys == :poly

function SUBST(ty: Type, tyVarName: string, repTy: Type): Type {
  switch (ty.tag) {
    case "Boolean":
    case "Number":
      return ty;
    case "Func": {
      const params = ty.params.map(({ name, type }) => ({ name, type: SUBST(type, tyVarName, repTy) }));
      const retType = SUBST(ty.retType, tyVarName, repTy);
      return { tag: "Func", params, retType };
    }
%   if sys == :rec || sys == :rec2
    case "Object": {
      const props = ty.props.map(({ name, type }) => ({ name, type: SUBST(type, tyVarName, repTy) }));
      return { tag: "Object", props };
    }
%   end
%   if sys == :rec2
    case "TaggedUnion": {
      const variants = ty.variants.map(({ label, type }) => ({ label, type: SUBST(type, tyVarName, repTy) }));
      return { tag: "TaggedUnion", variants };
    }
%   end
%   if sys == :rec || sys == :rec2
    case "Rec": {
      if (ty.name === tyVarName) return ty;
      return { tag: "Rec", name: ty.name, type: SUBST(ty.type, tyVarName, repTy) };
    }
%   end
%   if sys == :poly_bug
    case "TypeAbs": {
      //if (ty.typeParams.includes(tyVarName)) return ty;
      const newType = SUBST(ty.type, tyVarName, repTy);
      return { tag: "TypeAbs", typeParams: ty.typeParams, type: newType };
    }
%   end
%   if sys == :poly
    case "TypeAbs": {
      if (ty.typeParams.includes(tyVarName)) return ty;
      const { newTypeParams, newType } = freshTypeAbs(ty.typeParams, ty.type);
      const newType2 = subst(newType, tyVarName, repTy);
      return { tag: "TypeAbs", typeParams: newTypeParams, type: newType2 };
    }
%   end
    case "TypeVar": {
      return ty.name === tyVarName ? repTy : ty;
    }
  }
}
% end
% if sys == :rec || sys == :rec2

function simplifyType(ty: Type): Type {
  switch (ty.tag) {
    case "Rec":
      return SUBST(ty.type, ty.name, ty);
    default:
      return ty;
  }
}
% end
% if sys != :arith

function CHECK0(ty1: Type, ty2: Type, CHECK_CTX_PARAM): boolean {
%   if sys == :rec || sys == :rec2
  for (const [ty1_, ty2_] of CHECK_CTX) {
    if (typeEqNaive(ty1_, ty1, {}) && typeEqNaive(ty2_, ty2, {})) return true;
  }
  if (ty1.tag === "Rec") return CHECK0(simplifyType(ty1), ty2, [...CHECK_CTX, [ty1, ty2]]);
  if (ty2.tag === "Rec") return CHECK0(ty1, simplifyType(ty2), [...CHECK_CTX, [ty1, ty2]]);

%   end
  switch (ty2.tag) {
    case "Boolean":
      return ty1.tag === "Boolean";
    case "Number":
      return ty1.tag === "Number";
    case "Func": {
      if (ty1.tag !== "Func") return false;
      if (ty1.params.length !== ty2.params.length) return false;
      for (let i = 0; i < ty1.params.length; i++) {
%   if sys != :sub
        if (!CHECK0(ty1.params[i].type, ty2.params[i].type, CHECK_CTX)) return false;
%   else
        if (!CHECK0(ty2.params[i].type, ty1.params[i].type, CHECK_CTX)) return false; // contravariant
%   end
      }
      if (!CHECK0(ty1.retType, ty2.retType, CHECK_CTX)) return false;
      return true;
    }
%   if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2
    case "Object": {
      if (ty1.tag !== "Object") return false;
%     if sys != :sub
      if (ty1.props.length !== ty2.props.length) return false;
%     else
      //if (ty1.props.length !== ty2.props.length) return false;
%     end
      for (const { name: name2, type: propTy2 } of ty2.props) {
        const found = ty1.props.find(({ name }) => name === name2);
        if (!found) return false;
        const { type: propTy1 } = found;
        if (!CHECK0(propTy1, propTy2, CHECK_CTX)) return false;
      }
      return true;
    }
%   end
%   if sys == :union || sys == :rec2
    case "TaggedUnion": {
      if (ty1.tag !== "TaggedUnion") return false;
      if (ty1.variants.length !== ty2.variants.length) return false;
      for (const { label: label1, type: variantTy1 } of ty1.variants) {
        const found = ty2.variants.find(({ label }) => label === label1);
        if (!found) return false;
        const { type: variantTy2 } = found;
        if (!CHECK0(variantTy1, variantTy2, CHECK_CTX)) return false;
      }
      return true;
    }
%   end
%   if sys == :rec || sys == :rec2
    case "TypeVar":
      throw "unreachable";
%   end
%   if sys == :poly_bug || sys == :poly
    case "TypeAbs": {
      if (ty1.tag !== "TypeAbs") return false;
      if (ty1.typeParams.length !== ty2.typeParams.length) return false;
      const newMap = { ...map };
      for (let i = 0; i < ty1.typeParams.length; i++) {
        newMap[ty1.typeParams[i]] = ty2.typeParams[i];
      }
      return CHECK0(ty1.type, ty2.type, newMap);
    }
    case "TypeVar": {
      if (ty1.tag !== "TypeVar") return false;
      if (!(ty1.name in map)) throw new Error(`unknown type variable: ${ty1.name}`);
      return map[ty1.name] === ty2.name;
    }
%   end
  }
}
% end
% if sys == :rec || sys == :rec2

function CHECK(ty1: Type, ty2: Type): boolean {
  return CHECK0(ty1, ty2, []);
}
% end
% if sys == :poly_bug || sys == :poly

function CHECK(ty1: Type, ty2: Type, tyVars: Set<string>): boolean {
  const map = {} as Record<string, string>;
  for (const tyVar of tyVars) map[tyVar] = tyVar;
  return CHECK0(ty1, ty2, map);
}
% end

export function typecheck(t: Term, tyEnv: TypeEnv): Type {
  switch (t.tag) {
    case "true":
      return { tag: "Boolean" };
    case "false":
      return { tag: "Boolean" };
    case "if": {
      const condTy = simplifyType(typecheck(t.cond, tyEnv));
      if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
      const thnTy = typecheck(t.thn, tyEnv);
      const elsTy = typecheck(t.els, tyEnv);
% if sys != :poly_bug && sys != :poly
      if (!CHECK(thnTy, elsTy)) error("then and else have different types", t);
% else
      if (!CHECK(thnTy, elsTy, tyVars)) error("then and else have different types", t);
% end
      return thnTy;
    }
    case "number":
      return { tag: "Number" };
    case "add": {
      const leftTy = simplifyType(typecheck(t.left, tyEnv));
      if (leftTy.tag !== "Number") error("number expected", t.left);
      const rightTy = simplifyType(typecheck(t.right, tyEnv));
      if (rightTy.tag !== "Number") error("number expected", t.right);
      return { tag: "Number" };
    }
% if sys != :arith
    case "var": {
      if (!(t.name in tyEnv)) error(`unknown variable: ${t.name}`, t);
      return tyEnv[t.name];
    }
    case "func": {
      const newTyEnv = { ...tyEnv };
      for (const { name, type } of t.params) {
        newTyEnv[name] = type;
      }
      const retType = typecheck(t.body, newTyEnv);
% if sys == :recfunc2
      if (t.retType) {
        if (!typeEq(retType, t.retType)) error("wrong return type", t.body);
      }
% end
      return { tag: "Func", params: t.params, retType };
    }
    case "call": {
      const funcTy = simplifyType(typecheck(t.func, tyEnv));
      if (funcTy.tag !== "Func") error("function type expected", t.func);
      if (funcTy.params.length !== t.args.length)
        error("wrong number of arguments", t);
      for (let i = 0; i < t.args.length; i++) {
        const argTy = typecheck(t.args[i], tyEnv);
% if sys != :poly_bug && sys != :poly
        if (!CHECK(argTy, funcTy.params[i].type))
          error("parameter type mismatch", t.args[i]);
% else
        if (!CHECK(argTy, funcTy.params[i].type, tyVars))
          error("parameter type mismatch", t.args[i]);
% end
      }
      return funcTy.retType;
    }
% if sys != :basic2
    case "seq":
      typecheck(t.body, tyEnv);
      return typecheck(t.rest, tyEnv);
% if sys != :recfunc2
    case "const": {
      const ty = typecheck(t.init, tyEnv);
      const newTyEnv = { ...tyEnv, [t.name]: ty };
      return typecheck(t.rest, newTyEnv);
    }
% else
    case "const": {
      if (t.init.tag === "func") {
        if (!t.init.retType) error("return type must be specified", t.init);
        const funcTy: Type = { tag: "Func", params: t.init.params, retType: t.init.retType };
        const newTyEnv = { ...tyEnv };
        for (const { name, type } of t.init.params) {
          newTyEnv[name] = type;
        }
        const newTyEnv2 = { ...newTyEnv, [t.name]: funcTy };
        if (!typeEq(t.init.retType, typecheck(t.init.body, newTyEnv2))) error("wrong return type", t.init.body);
        const newTyEnv3 = { ...tyEnv, [t.name]: funcTy };
        return typecheck(t.rest, newTyEnv3);
      } else {
        const ty = typecheck(t.init, tyEnv);
        const newTyEnv = { ...tyEnv, [t.name]: ty };
        return typecheck(t.rest, newTyEnv);
      }
    }
% end
% else
    case "seq2": {
      let lastTy: Type | null = null;
      for (const term of t.body) {
        if (term.tag === "const2") {
          const ty = typecheck(term.init, tyEnv);
          tyEnv = { ...tyEnv, [term.name]: ty };
        } else {
          lastTy = typecheck(term, tyEnv);
        }
      }
      return lastTy!;
    }
    case "const2":
      throw "unreachable";
% end
% if sys == :obj || sys == :union || sys == :sub || sys == :rec || sys == :rec2
    case "objectNew": {
      const props = t.props.map(({ name, term }) => ({ name, type: typecheck(term, tyEnv) }));
      return { tag: "Object", props };
    }
    case "objectGet": {
      const objectTy = simplifyType(typecheck(t.obj, tyEnv));
      if (objectTy.tag !== "Object") error("object type expected", t.obj);
      const found = objectTy.props.find(({ name }) => name === t.propName);
      if (!found) error(`unknown property name: ${t.propName}`, t);
      return found.type;
    }
%   end
%   if sys == :union || sys == :rec2
    case "taggedUnionNew": {
      const asTy = simplifyType(t.as);
      if (asTy.tag !== "TaggedUnion") error(`"as" must have a tagged union type`, t);
      const found = asTy.variants.find(({ label }) => label === t.label);
      if (!found) error(`unknown variant label: ${t.label}`, t);
      const { type: expectedTy } = found;
      const actualTy = typecheck(t.term, tyEnv);
      if (!CHECK(expectedTy, actualTy)) error("tagged union's term has a wrong type", t.term);
      return t.as;
    }
    case "taggedUnionGet": {
%     if sys == :rec2
      const variantTy = simplifyType(tyEnv[t.varName]);
%     else
      const variantTy = tyEnv[t.varName];
%     end
      if (variantTy.tag !== "TaggedUnion") error(`variable ${t.varName} must have a tagged union type`, t);
      let retTy: Type | null = null;
      for (const { label: caseTag, term: clause } of t.clauses) {
        const found = variantTy.variants.find(({ label }) => label === caseTag);
        if (!found) error(`tagged union type has no case: ${caseTag}`, clause);
        const localTy: Type = { tag: "Object", props: [{ name: "val", type: found.type }] };
        const newTyEnv = { ...tyEnv, [t.varName]: localTy };
        const clauseTy = typecheck(clause, newTyEnv);
        if (retTy) {
          if (!CHECK(retTy, clauseTy)) error("clauses has different types", clause);
        } else {
          retTy = clauseTy;
        }
      }
      if (variantTy.variants.length !== t.clauses.length) error("switch case is not exhaustive", t);
      return retTy!;
    }
%   end
%   if sys == :recfunc || sys == :recfunc2 || sys == :rec || sys == :rec2
    case "recFunc": {
      const funcTy: Type = { tag: "Func", params: t.params, retType: t.retType };
      const newTyEnv = { ...tyEnv };
      for (const { name, type } of t.params) {
        newTyEnv[name] = type;
      }
      const newTyEnv2 = { ...newTyEnv, [t.funcName]: funcTy };
      const retTy = typecheck(t.body, newTyEnv2);
      if (!CHECK(t.retType, retTy)) error("wrong return type", t);
      const newTyEnv3 = { ...tyEnv, [t.funcName]: funcTy };
      return typecheck(t.rest, newTyEnv3);
    }
%   end
% end
% if sys == :poly_bug || sys == :poly
    case "typeAbs": {
      const tyVars2 = new Set(tyVars);
      for (const tyVar of t.typeParams) tyVars2.add(tyVar);
      const bodyTy = typecheck(t.body, tyEnv, tyVars2);
      return { tag: "TypeAbs", typeParams: t.typeParams, type: bodyTy };
    }
    case "typeApp": {
      const bodyTy = typecheck(t.typeAbs, tyEnv, tyVars);
      if (bodyTy.tag !== "TypeAbs") error("type abstraction expected", t.typeAbs);
      if (bodyTy.typeParams.length !== t.typeArgs.length) error("wrong number of type arguments", t);
      let newTy = bodyTy.type;
      for (let i = 0; i < bodyTy.typeParams.length; i++) {
        newTy = SUBST(newTy, bodyTy.typeParams[i], t.typeArgs[i]);
      }
      return newTy;
    }
% end
  }
}
END
  if sys == :arith
    code = code.gsub(", tyEnv: TypeEnv", "")
    code = code.gsub(", tyEnv", "")
    #code = code.gsub('{ tag: "Boolean" }', '"Boolean"')
    #code = code.gsub('{ tag: "Number" }', '"Number"')
    #code = code.gsub('.tag !== ', ' !== ')
  end
  case sys
  when :arith
    code = code.gsub(/!CHECK\((.+?), (.+?)\)/) { "#$1.tag !== #$2.tag" }
    code = code.gsub(/simplifyType\(([^()]*(\([^()]*\g<2>*\)[^()]*)*)\)/, "\\1")
  when :sub
    code = code.gsub(", CHECK_CTX_PARAM", "")
    code = code.gsub(", CHECK_CTX", "")
    code = code.gsub("CHECK0", "subtype")
    code = code.gsub("CHECK", "subtype")
    code = code.sub(/^( *)\| \{ tag: \"if\";/) { $&.gsub(/^  /, "  //") }
    code = code.sub(/^( *)case "if": \{.*?\1\}/m) { $&.gsub(/^    /, "    //") }
    code = code.gsub(/simplifyType\(([^()]*(\([^()]*\g<2>*\)[^()]*)*)\)/, "\\1")
  when :rec, :rec2
    code = code.gsub("CHECK_CTX_PARAM", "seen: [Type, Type][]")
    code = code.gsub("CHECK_CTX", "seen")
    code = code.gsub("CHECK0", "typeEqSub")
    code = code.gsub("CHECK", "typeEq")
    code = code.gsub("SUBST", "expandType")
  when :poly_bug, :poly
    code = code.gsub(", tyEnv: TypeEnv", ", tyEnv: TypeEnv, tyVars: Set<string>")
    code = code.gsub(", tyEnv)", ", tyEnv, tyVars)")
    code = code.gsub(", newTyEnv)", ", newTyEnv, tyVars)")
    code = code.gsub("CHECK_CTX_PARAM", "map: Record<string, string>")
    code = code.gsub("CHECK_CTX", "map")
    code = code.gsub("CHECK0", "typeEqSub")
    code = code.gsub("CHECK", "typeEq")
    code = code.gsub("SUBST", "subst")
    code = code.gsub(/simplifyType\(([^()]*(\([^()]*\g<2>*\)[^()]*)*)\)/, "\\1")
  else
    code = code.gsub(", CHECK_CTX_PARAM", "")
    code = code.gsub(", CHECK_CTX", "")
    code = code.gsub("CHECK0", "typeEq")
    code = code.gsub("CHECK", "typeEq")
    code = code.gsub(/simplifyType\(([^()]*(\([^()]*\g<2>*\)[^()]*)*)\)/, "\\1")
  end
  code = code.gsub("/*dummy*/", "")
  code = code.gsub("\n  ;", ";")

  type_def = code.split("------\n")[1]
  code = code.gsub("------\n", "")
  File.write(File.join(__dir__, "examples/#{ sys }.ts"), code)

  if suffix
    type_def
    %w(Type Param PropertyType VariantType Term PropertyTerm VariantTerm).each do |type_name|
      type_def = type_def.gsub(/\b#{ type_name }\b/, "#{ type_name }For#{ suffix }")
    end
    return type_def
  end
end

type_defs = [
  output(:arith, "Arith"),
  output(:basic, "Basic"),
  output(:basic2, "Basic2"),
  output(:obj, "Obj"),
  output(:union, "TaggedUnion"),
  output(:recfunc, "RecFunc"),
  output(:recfunc2),
  output(:sub, "Sub"),
  output(:rec, "Rec"),
  output(:rec2, "Rec2"),
  output(:poly_bug),
  output(:poly, "Poly"),
].compact.join.gsub(/^type/, "export type")

code = File.read("tiny-ts-parser.ts")
code = code.sub(%r{(// Types and terms for each system \(automatically generated\):\n).*?(\n// End of automatically generated code\n)}m) do
  $1 + type_defs.strip + $2
end
File.write("tiny-ts-parser.ts", code)
