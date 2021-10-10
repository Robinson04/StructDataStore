import {BasicObjectStore} from "../Stores/ObjectStores/BasicObjectStore";
import {BaseFieldModel, MapModel} from "../ModelsFields";

interface StoreObjectModel {
    container1: {
        field1: number;
    }
}

describe('BasicObjectStore', () => {
    test('Simple attribute retrieval', async () => {
        const store = new BasicObjectStore<StoreObjectModel>({
            retrieveDataCallable: () => Promise.resolve(undefined),
            objectModel: new MapModel({fields: {
                'container1': new MapModel({fields: {
                    'field1': new BaseFieldModel({})
                }})
            }})}
        );
        store.loadFromData({'container1': {'field1': 42}});
        const retrievedField1Value: number | undefined = await store.getAttr('container1.field1');
        expect(retrievedField1Value).toEqual(42);
    });
});