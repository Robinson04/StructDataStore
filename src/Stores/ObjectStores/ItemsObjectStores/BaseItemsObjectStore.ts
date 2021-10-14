import {F, O, S, U} from 'ts-toolbelt';
import * as _ from 'lodash';
import * as immutable from 'immutable';
import {loadObjectDataToImmutableValuesWithFieldsModel} from "../../../DataProcessors";
import BaseObjectStore, {BaseObjectStoreProps} from "../BaseObjectStore";
import {MapModel, TypedDictFieldModel} from "../../../ModelsFields";
import ImmutableRecordWrapper from "../../../ImmutableRecordWrapper";
import {ObjectFlattenedRecursiveMutatorsResults, ObjectOptionalFlattenedRecursiveMutators} from "../../../types";


export interface BaseItemsObjectStoreProps extends BaseObjectStoreProps {
    itemModel: MapModel;
}

export default abstract class BaseItemsObjectStore<T extends { [p: string]: any }> extends BaseObjectStore<{ [recordKey: string]: T }> {
    protected constructor(public readonly props: BaseItemsObjectStoreProps) {
        super(props);
    }

    private makeRelativeAttrKeyPath<P extends string>(attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>): {
        itemKey: string, relativeAttrKeyPath: F.AutoPath<T, P> | null
    } {
        const attrKeyPathParts: string[] = attrKeyPath.split('.');
        const relativeAttrKeyPath: F.AutoPath<T, P> | null = (
            attrKeyPathParts.length > 1 ? attrKeyPathParts.slice(1).join('.') as F.AutoPath<T, P> : null
        );
        return {itemKey: attrKeyPathParts[0], relativeAttrKeyPath};
    }

    protected async getMatchingDataWrapper<P extends string>(attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>): (
        Promise<{ dataWrapper: ImmutableRecordWrapper<T> | null, relativeAttrKeyPath: F.AutoPath<T, P> | null }>
    ) {
        const {itemKey, relativeAttrKeyPath} = this.makeRelativeAttrKeyPath(attrKeyPath);
        const dataWrapper: ImmutableRecordWrapper<T> | null = await this.getSingleRecordItem(itemKey);
        return {dataWrapper, relativeAttrKeyPath};
    }

    makeRecordDataWrapperFromItem(recordKey: string, recordItem: immutable.RecordOf<T>): ImmutableRecordWrapper<T> {
        return new ImmutableRecordWrapper<T>(recordItem, this.props.itemModel.props.fields[recordKey] as MapModel);
    }

    makeRecordWrapperFromData(recordKey: string, recordData: T): ImmutableRecordWrapper<T> | null {
        const recordItem: immutable.RecordOf<T> | null = loadObjectDataToImmutableValuesWithFieldsModel<T>(recordData, this.props.itemModel);
        return recordItem != null ? this.makeRecordDataWrapperFromItem(recordKey, recordItem) : null;
    }

    protected recordsDataToWrappers(data: { [recordKey: string]: T }): { [recordKey: string]: ImmutableRecordWrapper<T> } {
        return _.transform(data, (result: { [recordKey: string]: ImmutableRecordWrapper<T> | null }, recordData: T, recordKey: string) => {
                result[recordKey] = this.makeRecordWrapperFromData(recordKey, recordData)
            }, {}
        );
    }

    abstract loadFromData(data: { [recordKey: string]: T }): { subscribersPromise: Promise<any> };
    
    abstract getSingleRecordItem(key: string): Promise<ImmutableRecordWrapper<T> | null>;

    abstract getMultipleRecordItems(recordKeys: string[]): Promise<{ [recordKey: string]: ImmutableRecordWrapper<T> | null }>;

    async getAttr<P extends string>(
        attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>
    ): Promise<O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>> | undefined> {
        const {dataWrapper, relativeAttrKeyPath} = await this.getMatchingDataWrapper<P>(attrKeyPath);
        if (dataWrapper != null) {
            if (relativeAttrKeyPath != null) {
                return dataWrapper.getAttr(relativeAttrKeyPath);
            } else {
                // todo: update entire attr wrapper, maybe add a case of updateAttr in the
                //  dataWrapper, where if an empty string is passed, the root object is updated ?
            }
        }
        return undefined;
    }

    private makeAttrsRelativeKeyPathsByItemsKeys<P extends string>(attrsKeyPaths: F.AutoPath<T, P>[]): { [itemKey: string]: F.AutoPath<T, P>[] } {
        return _.transform(attrsKeyPaths,
            (output: { [p: string]: F.AutoPath<T, P>[] }, attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>) => {
                const {itemKey, relativeAttrKeyPath} = this.makeRelativeAttrKeyPath(attrKeyPath);
                if (relativeAttrKeyPath != null) {
                    const existingContainer: F.AutoPath<T, P>[] | undefined = output[itemKey];
                    if (existingContainer !== undefined) {
                        existingContainer.push(relativeAttrKeyPath);
                    } else {
                        output[itemKey] = [relativeAttrKeyPath];
                    }
                } else {
                    // todo: handle null relativeAttrKeyPath
                }
            }, {}
        );
    }

    private makeAttrsRelativeMutatorsByItemsKeys<M extends ObjectOptionalFlattenedRecursiveMutators<T>>(
        mutators: M
    ): { [itemKey: string]: { [relativeAttrKeyPath: string]: any } } {
        return _.transform(mutators,
            (output: { [itemKey: string]: { [relativeAttrKeyPath: string]: any } }, mutatorValue: any, mutatorAttrKeyPath: string) => {
                const {itemKey, relativeAttrKeyPath} = this.makeRelativeAttrKeyPath(mutatorAttrKeyPath as F.AutoPath<T, any>);
                if (relativeAttrKeyPath != null) {
                    const existingContainer: { [relativeAttrKeyPath: string]: any } | undefined = output[itemKey];
                    if (existingContainer !== undefined) {
                        existingContainer[relativeAttrKeyPath as string] = mutatorValue;
                    } else {
                        output[itemKey] = {[relativeAttrKeyPath as string]: mutatorValue};
                    }
                } else {
                    // todo: add support for null relativeAttrKeyPath
                }
            }, {}
        );
    }

    async getMultipleAttrs<P extends string>(
        attrsKeyPaths: F.AutoPath<{ [recordKey: string]: T }, P>[]
    ): Promise<O.Optional<U.Merge<O.P.Pick<{ [recordKey: string]: T }, S.Split<P, ".">>>>> {
        const attrsRelativeKeyPathsByItemsKeys: { [itemKey: string]: F.AutoPath<T, P>[] } = (
            this.makeAttrsRelativeKeyPathsByItemsKeys(attrsKeyPaths)
        );
        const dataWrappers: { [itemKey: string]: ImmutableRecordWrapper<T> | null } = await (
            this.getMultipleRecordItems(Object.keys(attrsRelativeKeyPathsByItemsKeys))
        );
        const retrievedValues: { [attrKeyPath: string]: any } = _.transform(attrsRelativeKeyPathsByItemsKeys,
            (result: { [absoluteAttrKeyPath: string]: any }, relativeAttrsKeysPathsToRetrieve: F.AutoPath<T, P>[], itemKey: string) => {
                const matchingDataWrapper: ImmutableRecordWrapper<T> | null = dataWrappers[itemKey];
                if (matchingDataWrapper != null) {
                    const retrievedAttributes = matchingDataWrapper.getMultipleAttrs(relativeAttrsKeysPathsToRetrieve);
                    _.forEach(retrievedAttributes, (attrRetrievedValue: any, relativeAttrKeyPath: string) => {
                        const absoluteAttrKeyPath: string = `${itemKey}.${relativeAttrKeyPath}`;
                        result[absoluteAttrKeyPath] = attrRetrievedValue;
                    });
                }
            }, {}
        );
        return retrievedValues as U.Merge<O.P.Pick<{ [recordKey: string]: T }, S.Split<P, ".">>>;
    }

    async updateAttrWithReturnedSubscribersPromise<P extends string>(
        attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>, value: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>>
    ): Promise<{ oldValue: O.Path<T, S.Split<P, '.'>> | undefined, subscribersPromise: Promise<any> }> {
        const {dataWrapper, relativeAttrKeyPath} = await this.getMatchingDataWrapper<P>(attrKeyPath);
        if (dataWrapper != null) {
            if (relativeAttrKeyPath != null) {
                const oldValue: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>> | undefined = dataWrapper.updateAttr(relativeAttrKeyPath, value);
                const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForAttr(attrKeyPath);
                return {oldValue, subscribersPromise};
            } else {
                // todo: handle null relativeAttrKeyPath
            }
        }
        return {oldValue: undefined, subscribersPromise: new Promise(resolve => resolve(undefined))};
    }

    async updateMultipleAttrsWithReturnedSubscribersPromise<M extends ObjectOptionalFlattenedRecursiveMutators<{ [recordKey: string]: T }>>(
        mutators: M
    ): Promise<{ oldValues: ObjectFlattenedRecursiveMutatorsResults<{ [recordKey: string]: T }, M> | undefined; subscribersPromise: Promise<any> }> {
        const attrsRelativeMutatorsByItemsKeys: { [itemKey: string]: { [relativeAttrKeyPath: F.AutoPath<T, S.Split<P, '.'>>]: any } } = (
            this.makeAttrsRelativeMutatorsByItemsKeys<M>(mutators)
        );
        const dataWrappers: { [itemKey: string]: ImmutableRecordWrapper<T> | null } = await (
            this.getMultipleRecordItems(Object.keys(attrsRelativeMutatorsByItemsKeys))
        );
        const collectedOldValues: { [attrKey: string]: any } = _.transform(attrsRelativeMutatorsByItemsKeys,
            (result: { [absoluteAttrKeyPath: string]: any }, relativeMutatorsToExecute: { [relativeAttrKeyPath: string]: any }, itemKey: string) => {
                const matchingDataWrapper: ImmutableRecordWrapper<T> | null = dataWrappers[itemKey];
                if (matchingDataWrapper != null) {
                    const oldValues: { [relativeAttrKeyPath: string]: any } = matchingDataWrapper.updateMultipleAttrs(relativeMutatorsToExecute);
                    _.forEach(oldValues, (attrOldValue: any, relativeAttrKeyPath: string) => {
                        const absoluteAttrKeyPath: string = `${itemKey}.${relativeAttrKeyPath}`;
                        result[absoluteAttrKeyPath] = attrOldValue;
                    });
                }
            }, {}
        );
        const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForMultipleAttrs(Object.keys(mutators));
        return {oldValues: collectedOldValues as ObjectFlattenedRecursiveMutatorsResults<{ [recordKey: string]: T }, M>, subscribersPromise};
    }

    async updateDataToAttrWithReturnedSubscribersPromise<P extends string>(
        attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>, value: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>>
    ): Promise<{ oldValue: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>> | undefined, subscribersPromise: Promise<any> }> {
        // todo: implement
        return {oldValue: undefined, subscribersPromise: Promise.resolve(undefined)};
    }

    async updateDataToMultipleAttrsWithReturnedSubscribersPromise<M extends ObjectOptionalFlattenedRecursiveMutators<{ [recordKey: string]: T }>>(
        mutators: M
    ): Promise<{ oldValues: ObjectFlattenedRecursiveMutatorsResults<{ [recordKey: string]: T }, M> | undefined; subscribersPromise: Promise<any> }> {
        // todo: implement
        return {oldValues: undefined, subscribersPromise: Promise.resolve(undefined)};
    }

    async deleteAttrWithReturnedSubscribersPromise<P extends string>(
        attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>
    ): Promise<{ subscribersPromise: Promise<any> }> {
        const {dataWrapper, relativeAttrKeyPath} = await this.getMatchingDataWrapper<P>(attrKeyPath);
        if (dataWrapper != null) {
            if (relativeAttrKeyPath != null) {
                dataWrapper.deleteAttr(relativeAttrKeyPath);
                const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForAttr(attrKeyPath);
                return {subscribersPromise};
            } else {
                // todo: handle null relativeAttrKeyPath
            }
        }
        return {subscribersPromise: new Promise(resolve => resolve(undefined))};
    }

    async deleteMultipleAttrsWithReturnedSubscribersPromise<P extends string>(
        attrsKeyPaths: F.AutoPath<{ [recordKey: string]: T }, P>[]
    ): Promise<{ subscribersPromise: Promise<any> }> {
        const attrsRelativeKeyPathsByItemsKeys: { [itemKey: string]: F.AutoPath<T, P>[] } = (
            this.makeAttrsRelativeKeyPathsByItemsKeys(attrsKeyPaths)
        );
        const dataWrappers: { [itemKey: string]: ImmutableRecordWrapper<T> | null } = await (
            this.getMultipleRecordItems(Object.keys(attrsRelativeKeyPathsByItemsKeys))
        );
        _.forEach(attrsRelativeKeyPathsByItemsKeys, (relativeAttrsKeysPathsToDelete: F.AutoPath<T, P>[], itemKey: string) => {
            const matchingDataWrapper: ImmutableRecordWrapper<T> | null = dataWrappers[itemKey];
            if (matchingDataWrapper != null) {
                matchingDataWrapper.deleteMultipleAttrs(relativeAttrsKeysPathsToDelete);
            }
        });
        const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForMultipleAttrs(attrsKeyPaths);
        return {subscribersPromise};
    }

    async removeAttrWithReturnedSubscribersPromise<P extends string>(
        attrKeyPath: F.AutoPath<{ [recordKey: string]: T }, P>
    ): Promise<{ oldValue: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>> | undefined, subscribersPromise: Promise<any> }> {
        const {dataWrapper, relativeAttrKeyPath} = await this.getMatchingDataWrapper<P>(attrKeyPath);
        if (dataWrapper != null) {
            if (relativeAttrKeyPath != null) {
                const oldValue: O.Path<{ [recordKey: string]: T }, S.Split<P, '.'>> | undefined = dataWrapper.removeAttr(relativeAttrKeyPath);
                const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForAttr(attrKeyPath);
                return {oldValue, subscribersPromise};
            } else {
                // todo: handle null relativeAttrKeyPath
            }
        }
        return {oldValue: undefined, subscribersPromise: new Promise(resolve => resolve(undefined))};
    }

    async removeMultipleAttrsWithReturnedSubscribersPromise<P extends string>(
        attrsKeyPaths: F.AutoPath<{ [recordKey: string]: T }, P>[]
    ): Promise<{ removedValues: U.Merge<O.P.Pick<{ [recordKey: string]: T }, S.Split<P, '.'>>> | undefined, subscribersPromise: Promise<any> }> {
        const attrsRelativeKeyPathsByItemsKeys: { [itemKey: string]: F.AutoPath<T, P>[] } = (
            this.makeAttrsRelativeKeyPathsByItemsKeys(attrsKeyPaths)
        );
        const dataWrappers: { [itemKey: string]: ImmutableRecordWrapper<T> | null } = await (
            this.getMultipleRecordItems(Object.keys(attrsRelativeKeyPathsByItemsKeys))
        );
        const collectedOldValues: { [removedAttrKeyPath: string]: any } = _.transform(attrsRelativeKeyPathsByItemsKeys,
            (result: { [absoluteAttrKeyPath: string]: any }, relativeAttrsKeysPathsToRemove: F.AutoPath<T, P>[], itemKey: string) => {
                const matchingDataWrapper: ImmutableRecordWrapper<T> | null = dataWrappers[itemKey];
                if (matchingDataWrapper != null) {
                    const oldValues = matchingDataWrapper.removeMultipleAttrs(relativeAttrsKeysPathsToRemove);
                    _.forEach(oldValues, (attrOldValue: any, relativeAttrKeyPath: string) => {
                        const absoluteAttrKeyPath: string = `${itemKey}.${relativeAttrKeyPath}`;
                        result[absoluteAttrKeyPath] = attrOldValue;
                    });
                }
            }, {}
        );
        const subscribersPromise: Promise<any> = this.subscriptionsManager.triggerSubscribersForMultipleAttrs(attrsKeyPaths);
        return {removedValues: collectedOldValues as U.Merge<O.P.Pick<{ [recordKey: string]: T }, S.Split<P, ".">>>, subscribersPromise};
    }
}