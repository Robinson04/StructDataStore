import * as _ from 'lodash';
import {asyncTriggerSubscribers} from "../utils/async";
import SubscriptionsManager from "../SubscriptionsManager";


export abstract class BaseStore {
    public activeSubscribersIndex: number;
    public readonly subscribers: { [index: number]: () => any };

    protected constructor() {
        this.activeSubscribersIndex = 0;
        this.subscribers = {};
    }

    subscribe(callback: () => any): number {
        const index: number = this.activeSubscribersIndex;
        this.subscribers[index] = callback;
        this.activeSubscribersIndex += 1;
        return index;
    }

    unsubscribe(index: number): undefined {
        delete this.subscribers[index];
        return undefined;
    }

    async triggerSubscribers() {
        await asyncTriggerSubscribers(this.subscribers);
    }
}

export abstract class ExternalSubscriptionsContainer {
    private readonly subscribers: { [index: number]: () => any };

    protected constructor() {
        this.subscribers = {};
    }

    abstract get activeSubscribersIndex(): number;

    abstract set activeSubscribersIndex(value: number);

    subscribe(callback: () => any): number {
        const index: number = this.activeSubscribersIndex;
        this.subscribers[index] = callback;
        this.activeSubscribersIndex += 1;
        return index;
    }

    unsubscribe(index: number): undefined {
        delete this.subscribers[index];
        return undefined;
    }

    triggerSubscribers() {
        _.forEach(this.subscribers, (callback: () => any) => callback());
    }
}

