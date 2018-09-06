/* @flow */

import Dep from './dep'
import { arrayMethods } from './array' //经过改写的数组方法
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * By default, when a reactive property is set, the new value is
 * also converted to become reactive. However when passing down props,
 * we don't want to force conversion because the value may be a nested value
 * under a frozen data structure. Converting it would defeat the optimization.
 */
export const observerState = {
  shouldConvert: true
}

/**
 * Observer class that are attached to each observed
 * object. Once attached, the observer converts target
 * object's property keys into getter/setters that
 * collect dependencies and dispatches updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor(value: any){
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)  // Observer class that are attached to each observed
    if ( Array.isArray(value) ) {
      // 如果是数组,要改写数组的push pop shift等方法 参见http://v1.vuejs.org/guide/list.html#Array-Change-Detection
      // 而es5及更低版本的js情况下无法完美继承数组
      // 参见http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/
      // 如果浏览器实现了非标准的__proto__属性的话,那么可以实现继承数组,
      // 否则就只能用扩展实例的方式将改写过的push等方法直接def到实例上
      const augment = hasProto // hasProto means : can we use __proto__?
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object){
    const keys = Object.keys(obj)
    for ( let i = 0; i < keys.length; i++ ) {
      defineReactive(obj, keys[i], obj[keys[i]])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>){
    for ( let i = 0, l = items.length; i < l; i++ ) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
// 如果浏览器环境中有__proto__这个属性可用,那么可以用原型链继承的方式去继承数组
function protoAugment(target, src: Object, keys: any){
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
// 否则不能继承数组,只能采用扩展实例的方式
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>){
  for ( let i = 0, l = keys.length; i < l; i++ ) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any, asRootData: ?boolean): Observer | void{
  if ( !isObject(value) ) {
    return
  }
  let ob: Observer | void
  if ( hasOwn(value, '__ob__') && value.__ob__ instanceof Observer ) {
    ob = value.__ob__
  } else if (
    observerState.shouldConvert &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if ( asRootData && ob ) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 在此将对象属性转化为访问器属性
 */
export function defineReactive(obj: Object,
                               key: string,
                               val: any,
                               customSetter?: ?Function,
                               shallow?: boolean){
  const dep = new Dep()
  //访问器属性的取值储存在val里。因为在get和set里有用到，所以val不会被回收。
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if ( property && property.configurable === false ) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set

  //如果val不是数组或对象，那么childOb为空
  //如果val是数组或者对象，那么childOb为Observer的实例
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter(){
      const value = getter ? getter.call(obj) : val
      if ( Dep.target ) {
        // Dep.target指正在计算的watcher
        // 问题： watcher什么时候存在？ watcher是啥？

        dep.depend() //增加依赖,添加当前Dep.target进入dep中。
        // dep.depend() 即
        // if (Dep.target) {
        //   Dep.target.addDep(this)
        // }
        // Dep.target.addDep(dep)又等价于
        // 一堆判断条件和dep.addSub(Dep.target)

        if ( childOb ) {
          childOb.dep.depend()
        }
        if ( Array.isArray(value) ) {
          dependArray(value)
        }
      }
      return value
    },
    set: function reactiveSetter(newVal){
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      //newVal !== newVal 表示判断是否是null
      if ( newVal === value || (newVal !== newVal && value !== value) ) {
        return
      }
      /* eslint-enable no-self-compare */
      if ( process.env.NODE_ENV !== 'production' && customSetter ) {
        customSetter()
      }
      if ( setter ) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      //通知依赖更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any{
  if ( Array.isArray(target) && isValidArrayIndex(key) ) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if ( hasOwn(target, key) ) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if ( target._isVue || (ob && ob.vmCount) ) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if ( !ob ) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any){
  if ( Array.isArray(target) && isValidArrayIndex(key) ) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if ( target._isVue || (ob && ob.vmCount) ) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if ( !hasOwn(target, key) ) {
    return
  }
  delete target[key]
  if ( !ob ) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>){
  for ( let e, i = 0, l = value.length; i < l; i++ ) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if ( Array.isArray(e) ) {
      dependArray(e)
    }
  }
}
